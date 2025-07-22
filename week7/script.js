// This file contains the JavaScript code for controlling the functionality of the web page.

let map;
let markers = [];
let currentPopup = null; // 現在のポップアップを保持
let currentMarker = null; // 現在の赤ピンを保持
let hazardMapVisible = false; // ハザードマップの表示状態を管理
let earthquakeMarkers = []; // 過去24時間の地震ピン

// 災害種別ごとの国土地理院ハザードマップタイルURL（Leaflet用API）
const HAZARD_MAP_TILES = {
    // 洪水: 浸水想定区域
    flood: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin/{z}/{x}/{y}.png',
    // 津波: 津波浸水想定
    tsunami: 'https://disaportaldata.gsi.go.jp/raster/05_tsunami/{z}/{x}/{y}.png',
    // 新津波浸水想定（新凡例）
    tsunami_newlegend: 'https://disaportaldata.gsi.go.jp/raster/04_tsunami_newlegend_data/{z}/{x}/{y}.png',
    // 土砂災害: 土石流危険渓流
    landslide: 'https://disaportaldata.gsi.go.jp/raster/03_dosekiryu/{z}/{x}/{y}.png',
    // 高潮: 高潮浸水想定
    storm_surge: 'https://disaportaldata.gsi.go.jp/raster/06_takashio/{z}/{x}/{y}.png'
};

function initMap(center = [139.767125, 35.681236], zoom = 12) {
    map = new maplibregl.Map({
        container: 'map', // マップを表示するコンテナID
        style: 'https://tile.openstreetmap.jp/styles/osm-bright/style.json', // スタイルURL
        center: center, // 初期中心座標
        zoom: zoom // 初期ズームレベル
    });

    // ナビゲーションコントロールを追加
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // 現在地を表示（青いピンを追加）
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(pos) {
            const lng = pos.coords.longitude;
            const lat = pos.coords.latitude;
            map.setCenter([lng, lat]); // 現在地に地図を移動

            // 青いピンを立てる
            new maplibregl.Marker({ color: "blue" })
                .setLngLat([lng, lat])
                .setPopup(new maplibregl.Popup().setText("現在地"))
                .addTo(map);
        }, function() {
            console.error('現在地を取得できませんでした');
        }, {
            enableHighAccuracy: true, // 高精度の位置情報を要求
            timeout: 10000, // タイムアウト設定
            maximumAge: 0 // キャッシュを無効化
        });
    }
}

// DOMContentLoaded イベントでマップを初期化
window.addEventListener('DOMContentLoaded', function() {
    initMap();
    document.querySelectorAll('.hazard-map-select').forEach(el => {
        el.addEventListener('click', function(e) {
            e.preventDefault();
            setHazardMap(this.dataset.type);
        });
    });
    document.getElementById('clearMapButton').addEventListener('click', clearMapOverlays);

    // スマホ用機能リストの表示・イベント
    function setupMobileFuncList() {
        const mobileList = document.getElementById('mobile-func-list');
        if (window.innerWidth <= 600) {
            mobileList.style.display = 'flex';

            // 消去
            document.getElementById('clearMapButton-mobile').onclick = clearMapOverlays;

            // ハザードマップ
            document.querySelectorAll('.hazard-map-select-mobile').forEach(el => {
                el.onclick = function(e) {
                    e.preventDefault();
                    setHazardMap(this.dataset.type);
                };
            });

            // 検索
            document.getElementById('searchForm-mobile').onsubmit = function(e) {
                e.preventDefault();
                const place = document.getElementById('searchInput-mobile').value;
                if (place) showMap(place);
            };
        } else {
            mobileList.style.display = 'none';
        }
    }
    setupMobileFuncList();
    window.addEventListener('resize', setupMobileFuncList);

    // 3D表示切替ボタンのイベント
    const toggle3dButton = document.getElementById('toggle3dButton');
    let is3d = false;
    if (toggle3dButton) {
        toggle3dButton.onclick = function() {
            is3d = !is3d;
            if (is3d) {
                // 航空写真スタイルに変更
                map.setStyle(MAP_STYLE_SATELLITE);
                map.once('styledata', () => {
                    map.easeTo({ pitch: 60, bearing: 30, duration: 800 });
                });
                toggle3dButton.textContent = "2D表示に戻す";
            } else {
                // 通常地図スタイルに戻す
                map.setStyle(MAP_STYLE_NORMAL);
                map.once('styledata', () => {
                    map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
                });
                toggle3dButton.textContent = "3D表示切替";
            }
        };
    }

    // 映像ボタンのイベント
    const videoButton = document.getElementById('videoButton');
    if (videoButton) {
        videoButton.onclick = function() {
            if (!window.confirm('津波の映像が流れます。よろしいですか？')) {
                return;
            }
            // 1つ目の映像ピン
            const lat1 = 39.638702720797745;
            const lng1 = 141.94551467376274;
            const youtubeEmbed1 = `<iframe width="320" height="180" src="https://www.youtube.com/embed/4XvFFfgXwnw?si=whPbI32vQVmaw-6Y&autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;

            // 2つ目の映像ピン
            const lat2 = 38.909603012460195;
            const lng2 = 141.5826028844679;
            const youtubeEmbed2 = `<iframe width="320" height="180" src="https://www.youtube.com/embed/xvJnC_Rvbcs?si=kgACOcEFetgzcIlU&autoplay=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;

            // 既存映像ピンを消す
            if (window.videoMarkers && Array.isArray(window.videoMarkers)) {
                window.videoMarkers.forEach(m => m.remove());
            }
            window.videoMarkers = [];

            // 1つ目のピン
            const marker1 = new maplibregl.Marker({ color: "red" })
                .setLngLat([lng1, lat1])
                .setPopup(new maplibregl.Popup({ maxWidth: "340px" }).setHTML(`
                    <div>
                        <b>映像1</b><br>
                        ${youtubeEmbed1}
                    </div>
                `))
                .addTo(map);
            window.videoMarkers.push(marker1);

            // 2つ目のピン
            const marker2 = new maplibregl.Marker({ color: "red" })
                .setLngLat([lng2, lat2])
                .setPopup(new maplibregl.Popup({ maxWidth: "340px" }).setHTML(`
                    <div>
                        <b>映像2</b><br>
                        ${youtubeEmbed2}
                    </div>
                `))
                .addTo(map);
            window.videoMarkers.push(marker2);

            marker1.togglePopup();
            marker2.togglePopup();

            map.fitBounds([
                [lng1, lat1],
                [lng2, lat2]
            ], { padding: 80, maxZoom: 14 });
        };
    }

    // 消去ボタンで映像ピンも消す
    document.getElementById('clearMapButton').addEventListener('click', function() {
        // 赤ピン
        if (currentMarker) {
            currentMarker.remove();
            currentMarker = null;
        }
        // 経路
        if (map.getLayer('osrm-route-layer')) {
            map.removeLayer('osrm-route-layer');
        }
        if (map.getSource('osrm-route-source')) {
            map.removeSource('osrm-route-source');
        }
        // 徒歩時間ポップアップ
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
        // 映像ピン
        if (window.videoMarkers && Array.isArray(window.videoMarkers)) {
            window.videoMarkers.forEach(m => m.remove());
            window.videoMarkers = [];
        }
    });

    // スマホ用消去ボタンも同様
    document.getElementById('clearMapButton-mobile').addEventListener('click', function() {
        // 赤ピン
        if (currentMarker) {
            currentMarker.remove();
            currentMarker = null;
        }
        // 経路
        if (map.getLayer('osrm-route-layer')) {
            map.removeLayer('osrm-route-layer');
        }
        if (map.getSource('osrm-route-source')) {
            map.removeSource('osrm-route-source');
        }
        // 徒歩時間ポップアップ
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
        // 映像ピン
        if (window.videoMarkers && Array.isArray(window.videoMarkers)) {
            window.videoMarkers.forEach(m => m.remove());
            window.videoMarkers = [];
        }
    });

    // 小学校などの施設検索・候補表示・半径1km内ピン立て
    async function searchNearbyFacilities(keyword, center, radiusMeters = 1000) {
        // Overpass APIでOpenStreetMapから施設情報取得
        // 小学校の場合: amenity=school OR nameに小学校を含む
        const query = `
            [out:json][timeout:25];
            (
                node["amenity"="school"](around:${radiusMeters},${center[1]},${center[0]});
                node["name"~"${keyword}"](around:${radiusMeters},${center[1]},${center[0]});
                way["amenity"="school"](around:${radiusMeters},${center[1]},${center[0]});
                way["name"~"${keyword}"](around:${radiusMeters},${center[1]},${center[0]});
            );
            out center;
        `;
        const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

        try {
            const res = await fetch(url);
            const data = await res.json();
            if (!data.elements || data.elements.length === 0) {
                alert('該当する施設が見つかりませんでした');
                return;
            }

            // 既存ピンを消す
            if (window.facilityMarkers && Array.isArray(window.facilityMarkers)) {
                window.facilityMarkers.forEach(m => m.remove());
            }
            window.facilityMarkers = [];

            // 候補リストを表示
            const candidates = data.elements.map(el => {
                const lat = el.lat || (el.center && el.center.lat);
                const lon = el.lon || (el.center && el.center.lon);
                return {
                    name: el.tags && (el.tags.name || el.tags['name:ja'] || '小学校'),
                    lat,
                    lon
                };
            }).filter(c => c.lat && c.lon
                // 日本国内のみ（緯度: 24~46, 経度: 122~154）
                && c.lat > 24 && c.lat < 46 && c.lon > 122 && c.lon < 154
            );

            if (candidates.length === 0) {
                alert('該当する施設が見つかりませんでした');
                return;
            }

            // ピンを立てる
            candidates.forEach(c => {
                const marker = new maplibregl.Marker({ color: "green" })
                    .setLngLat([c.lon, c.lat])
                    .setPopup(new maplibregl.Popup().setHTML(`
                        <div>
                            ${c.name}
                            <br>
                            <button class="btn btn-sm btn-primary route-to-green" data-lat="${c.lat}" data-lon="${c.lon}">ここまでの避難経路</button>
                        </div>
                    `))
                    .addTo(map);
                window.facilityMarkers.push(marker);

                // ポップアップが開いた時にボタンイベント追加
                marker.getPopup().on('open', () => {
                    const btn = document.querySelector('.route-to-green[data-lat="' + c.lat + '"][data-lon="' + c.lon + '"]');
                    if (btn) {
                        btn.onclick = function() {
                            showRouteToShelter(c.lat, c.lon);
                        };
                    }
                });
            });

            // 候補リストを画面に表示（例: アラートで表示）
            alert(`半径1km内の候補:\n${candidates.map(c => c.name).join('\n')}`);

            // 地図を候補の中心に移動
            if (candidates.length > 0) {
                map.flyTo({ center: [candidates[0].lon, candidates[0].lat], zoom: 15 });
            }
        } catch (e) {
            alert('施設情報の取得に失敗しました');
            console.error(e);
        }
    }

    // 検索フォームのイベントを拡張
    document.getElementById('searchForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const place = document.getElementById('searchInput').value;
        if (place) {
            // まず地名検索
            showMap(place);

            // 小学校などの施設検索
            if (place.includes('小学校')) {
                // 現在地 or 地図中心で検索
                let center = map.getCenter();
                searchNearbyFacilities('小学校', [center.lng, center.lat], 1000);
            }
            // 他のキーワードも同様に拡張可能
        }
    });

    // 消去ボタンで施設ピンも消す
    document.getElementById('clearMapButton').addEventListener('click', function() {
        // 赤ピン
        if (currentMarker) {
            currentMarker.remove();
            currentMarker = null;
        }
        // 経路
        if (map.getLayer('osrm-route-layer')) {
            map.removeLayer('osrm-route-layer');
        }
        if (map.getSource('osrm-route-source')) {
            map.removeSource('osrm-route-source');
        }
        // 徒歩時間ポップアップ
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
        // 映像ピン
        if (window.videoMarkers && Array.isArray(window.videoMarkers)) {
            window.videoMarkers.forEach(m => m.remove());
            window.videoMarkers = [];
        }
        // 施設ピン
        if (window.facilityMarkers && Array.isArray(window.facilityMarkers)) {
            window.facilityMarkers.forEach(m => m.remove());
            window.facilityMarkers = [];
        }
    });
    document.getElementById('clearMapButton-mobile').addEventListener('click', function() {
        // 赤ピン
        if (currentMarker) {
            currentMarker.remove();
            currentMarker = null;
        }
        // 経路
        if (map.getLayer('osrm-route-layer')) {
            map.removeLayer('osrm-route-layer');
        }
        if (map.getSource('osrm-route-source')) {
            map.removeSource('osrm-route-source');
        }
        // 徒歩時間ポップアップ
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
        // 映像ピン
        if (window.videoMarkers && Array.isArray(window.videoMarkers)) {
            window.videoMarkers.forEach(m => m.remove());
            window.videoMarkers = [];
        }
        // 施設ピン
        if (window.facilityMarkers && Array.isArray(window.facilityMarkers)) {
            window.facilityMarkers.forEach(m => m.remove());
            window.facilityMarkers = [];
        }
    });

    // 固有名詞リスト（地名・施設名などのみ赤ピン表示）
    // const properNouns = [
    //     "東京駅",
    //     "大阪城",
    //     "仙台市立荒浜小学校",
    //     "札幌市立中央小学校",
    //     "名古屋市立山王小学校",
    //     "東北大学",
    //     "京都大学"
    //     // ...追加...
    // ];

    document.getElementById('searchForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const place = document.getElementById('searchInput').value.trim();
        if (!place) return;

        // 固有名詞リストに完全一致した場合のみ赤ピン表示
        if (properNouns.includes(place)) {
            showMap(place);
        } else {
            alert('地名や施設名（固有名詞）を正確に入力してください。');
            // 赤ピン・経路は表示しない
        }
    });

    // 赤ピン・経路・徒歩時間・映像ピンの消去ボタン
    function clearMapOverlays() {
        // 赤ピン
        if (currentMarker) {
            currentMarker.remove();
            currentMarker = null;
        }
        if (markers && markers.length > 0) {
            markers.forEach(m => m.remove());
            markers = [];
        }
        // 経路
        if (map.getLayer('osrm-route-layer')) {
            map.removeLayer('osrm-route-layer');
        }
        if (map.getSource('osrm-route-source')) {
            map.removeSource('osrm-route-source');
        }
        // 徒歩時間ポップアップ
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
        // 映像ピン
        if (window.videoMarkers && Array.isArray(window.videoMarkers)) {
            window.videoMarkers.forEach(m => m.remove());
            window.videoMarkers = [];
        }
    }

    // 固有名詞（地名・施設名など）のみ検索して地図表示
    const properNouns = [
        // 例: 固有名詞リスト（必要に応じて追加・編集）
        "東京駅",
        "大阪城",
        "仙台市立荒浜小学校",
        "札幌市立中央小学校",
        "名古屋市立山王小学校"
        // ...追加...
    ];

    document.getElementById('searchForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const place = document.getElementById('searchInput').value.trim();
        if (!place) return;

        // 固有名詞リストに完全一致した場合のみ地図表示
        if (properNouns.includes(place)) {
            showMap(place);
        } else {
            alert('地名や施設名（固有名詞）を正確に入力してください。');
            // 施設検索やピン立ては行わない
        }
    });
});

// ...existing code...

function showRouteToShelter(shelterLat, shelterLon) {
    if (!navigator.geolocation) {
        alert('現在地を取得できません');
        return;
    }

    navigator.geolocation.getCurrentPosition(async function(pos) {
        const start = [pos.coords.longitude, pos.coords.latitude];
        const end = [shelterLon, shelterLat];

        const osrmUrl = `https://router.project-osrm.org/route/v1/foot/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;

        try {
            const res = await fetch(osrmUrl);
            const json = await res.json();
            if (!json.routes || json.routes.length === 0) {
                alert('ルートが見つかりません');
                return;
            }

            const route = json.routes[0].geometry;
            const distance = json.routes[0].distance; // meters
            const walkingSpeed = 1.3; // m/s (約4.7km/h)
            const durationSeconds = distance / walkingSpeed;
            const durationMinutes = Math.round(durationSeconds / 60);

            // 既存ルートを削除
            const routeLayerId = 'osrm-route-layer';
            const routeSourceId = 'osrm-route-source';
            if (map.getLayer(routeLayerId)) map.removeLayer(routeLayerId);
            if (map.getSource(routeSourceId)) map.removeSource(routeSourceId);

            // ルートをGeoJSONとして追加
            map.addSource(routeSourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: route
                }
            });

            map.addLayer({
                id: routeLayerId,
                type: 'line',
                source: routeSourceId,
                paint: {
                    'line-color': '#ADFF2F',
                    'line-width': 5
                }
            });

            // 既存ポップアップを削除
            if (currentPopup) {
                currentPopup.remove();
            }

            // ポップアップで所要時間を表示
            if (route.coordinates && route.coordinates.length > 1) {
                const midIndex = Math.floor(route.coordinates.length / 2);
                const midCoord = route.coordinates[midIndex];
                const popupText = `徒歩 約${durationMinutes}分`;
                currentPopup = new maplibregl.Popup({ closeOnClick: false, closeButton: false })
                    .setLngLat(midCoord)
                    .setHTML(`<div class="custom-popup">${popupText}</div>`)
                    .addTo(map);
            }

            // 既存の赤ピンを削除
            if (currentMarker) {
                currentMarker.remove();
            }

            // 赤ピンを追加
            const destinationCoords = route.coordinates[route.coordinates.length - 1];
            currentMarker = new maplibregl.Marker({ color: "red" })
                .setLngLat(destinationCoords)
                .addTo(map);

            // 赤ピンにダブルクリックイベントを追加
            currentMarker.getElement().addEventListener('dblclick', () => {
                currentMarker.remove();
                currentMarker = null; // 赤ピンをリセット
            });
        } catch (err) {
            alert('経路取得に失敗しました');
            console.error(err);
        }
    }, function() {
        alert('現在地を取得できませんでした');
    });
}

function showMap(place) {
    // 既存の赤ピンを削除
    if (currentMarker) {
        currentMarker.remove();
        currentMarker = null;
    }
    markers.forEach(m => m.remove());
    markers = [];
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data[0]) {
                const lng = parseFloat(data[0].lon);
                const lat = parseFloat(data[0].lat);
                map.flyTo({ center: [lng, lat], zoom: 14 });
                // 赤ピンを最新のものだけ表示
                currentMarker = new maplibregl.Marker({ color: "red" })
                    .setLngLat([lng, lat])
                    .setPopup(new maplibregl.Popup().setHTML(`
                        <div>
                            <p>${place}</p>
                            <button id="routeButton" class="btn btn-sm btn-primary">ここまでのルートを表示</button>
                        </div>
                    `))
                    .addTo(map);
                markers.push(currentMarker);

                // ボタンのクリックイベントを追加
                currentMarker.getPopup().on('open', () => {
                    document.getElementById('routeButton').addEventListener('click', () => {
                        showRouteToShelter(lat, lng);
                    });
                });
            } else {
                alert('場所が見つかりませんでした');
            }
        });
}

document.getElementById('searchForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const place = document.getElementById('searchInput').value;
    if (place) {
        showMap(place);
    }
});

function updateSavedShelters() {
    const savedShelters = JSON.parse(localStorage.getItem('shelters')) || [];
    const container = document.getElementById('savedShelters');
    container.innerHTML = '';
    savedShelters.forEach((shelter, index) => {
        const div = document.createElement('div');
        div.className = 'alert alert-info alert-dismissible fade show mb-2';
        div.role = 'alert';
        div.innerHTML = `
            <span style="cursor:pointer;" class="shelter-link">${shelter}</span>
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="閉じる"></button>
        `;
        div.querySelector('.shelter-link').addEventListener('click', async function() {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(shelter)}`);
            const data = await res.json();
            if (data && data[0]) {
                const shelterLat = parseFloat(data[0].lat);
                const shelterLon = parseFloat(data[0].lon);

                // 前の赤ピンを削除
                if (currentMarker) {
                    currentMarker.remove();
                    currentMarker = null;
                }

                // 地図をその場所へ移動
                map.flyTo({ center: [shelterLon, shelterLat], zoom: 14 });

                // 赤いピンを最新のものだけ表示
                currentMarker = new maplibregl.Marker({ color: "red" })
                    .setLngLat([shelterLon, shelterLat])
                    .setPopup(new maplibregl.Popup().setText(shelter))
                    .addTo(map);

                // 現在地からその場所までの経路を表示
                showRouteToShelter(shelterLat, shelterLon);
            } else {
                alert('場所が見つかりませんでした');
            }
        });
        div.querySelector('.btn-close').addEventListener('click', function() {
            savedShelters.splice(index, 1);
            localStorage.setItem('shelters', JSON.stringify(savedShelters));
            updateSavedShelters();
        });
        container.appendChild(div);
    });
}

document.getElementById('shelterForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const shelterInput = document.getElementById('shelterInput');
    const shelter = shelterInput.value.trim();
    if (shelter) {
        const savedShelters = JSON.parse(localStorage.getItem('shelters')) || [];
        savedShelters.push(shelter);
        localStorage.setItem('shelters', JSON.stringify(savedShelters));
        updateSavedShelters();
        shelterInput.value = '';
        const shelterModal = bootstrap.Modal.getInstance(document.getElementById('shelterModal'));
        shelterModal.hide();
        showMap(shelter);
    }
});

document.getElementById('shelterModal').addEventListener('show.bs.modal', updateSavedShelters);

function updatePhoneList() {
    const phoneList = JSON.parse(localStorage.getItem('phones') || '[]');
    const ul = document.getElementById('phoneList');
    ul.innerHTML = '';
    phoneList.forEach((phone, idx) => {
        const li = document.createElement('li');
        li.className = 'list-group-item bg-dark text-light d-flex justify-content-between align-items-center';
        li.innerHTML = `
            <span>${phone}</span>
            <div>
                <button class="btn btn-sm btn-danger">削除</button>
            </div>
        `;
        li.querySelector('.btn-danger').onclick = function() {
            phoneList.splice(idx, 1);
            localStorage.setItem('phones', JSON.stringify(phoneList));
            updatePhoneList();
        };
        ul.appendChild(li);
    });
}

document.getElementById('phoneModal').addEventListener('show.bs.modal', function() {
    const phoneList = document.getElementById('phoneList');
    phoneList.innerHTML = '';
});

const phoneMemo = document.getElementById('phoneMemo');
phoneMemo.value = localStorage.getItem('phoneMemo') || '';
phoneMemo.addEventListener('input', function() {
    localStorage.setItem('phoneMemo', phoneMemo.value);
});

function renderChecklist() {
    const checklist = JSON.parse(localStorage.getItem('checklist') || '[]');
    const ul = document.getElementById('checklist');
    ul.innerHTML = '';
    checklist.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'list-group-item bg-dark text-light';
        li.innerHTML = `
            <input type="checkbox" class="form-check-input me-2" id="item${idx}">
            <span>${item.text}</span>
            <button type="button" class="btn btn-sm btn-danger ms-2 remove-checklist">削除</button>
        `;
        const cb = li.querySelector('input[type="checkbox"]');
        cb.checked = item.checked;
        cb.addEventListener('change', function() {
            checklist[idx].checked = cb.checked;
            localStorage.setItem('checklist', JSON.stringify(checklist));
        });
        li.querySelector('.remove-checklist').onclick = function() {
            checklist.splice(idx, 1);
            localStorage.setItem('checklist', JSON.stringify(checklist));
            renderChecklist();
        };
        ul.appendChild(li);
    });
}

window.addEventListener('DOMContentLoaded', renderChecklist);

document.getElementById('addChecklistForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const input = document.getElementById('newChecklistItem');
    const text = input.value.trim();
    if (text) {
        const checklist = JSON.parse(localStorage.getItem('checklist') || '[]');
        checklist.push({ text, checked: false });
        localStorage.setItem('checklist', JSON.stringify(checklist));
        input.value = '';
        renderChecklist();
    }
});

const listMemo = document.getElementById('listMemo');
listMemo.value = localStorage.getItem('listMemo') || '';
listMemo.addEventListener('input', function() {
    localStorage.setItem('listMemo', listMemo.value);
});

function applyTheme(theme) {
    if (theme === 'light') {
        document.body.style.background = '#fff';
        document.body.style.color = '#000';
        document.querySelectorAll('.bg-dark').forEach(e => e.classList.replace('bg-dark', 'bg-light'));
        document.querySelectorAll('.text-light').forEach(e => e.classList.replace('text-light', 'text-dark'));
        document.querySelectorAll('.modal-content').forEach(e => e.classList.replace('bg-dark', 'bg-light'));
        document.querySelectorAll('.form-control').forEach(e => {
            e.classList.remove('bg-dark', 'text-light');
            e.classList.add('bg-light', 'text-dark');
        });
        document.querySelectorAll('.nav-link').forEach(e => {
            e.classList.remove('text-light');
            e.classList.add('text-dark');
        });
        const brand = document.querySelector('.navbar-brand');
        if (brand) {
            brand.classList.remove('text-light');
            brand.classList.add('text-dark');
        }
    } else {
        document.body.style.background = '#000';
        document.body.style.color = '#fff';
        document.querySelectorAll('.bg-light').forEach(e => e.classList.replace('bg-light', 'bg-dark'));
        document.querySelectorAll('.text-dark').forEach(e => e.classList.replace('text-dark', 'text-light'));
        document.querySelectorAll('.modal-content').forEach(e => e.classList.replace('bg-light', 'bg-dark'));
        document.querySelectorAll('.form-control').forEach(e => {
            e.classList.remove('bg-light', 'text-dark');
            e.classList.add('bg-dark', 'text-light');
        });
        document.querySelectorAll('.nav-link').forEach(e => {
            e.classList.remove('text-dark');
            e.classList.add('text-light');
        });
        const brand = document.querySelector('.navbar-brand');
        if (brand) {
            brand.classList.remove('text-dark');
            brand.classList.add('text-light');
        }
    }
}

document.getElementById('settingsModal').addEventListener('show.bs.modal', function() {
    document.getElementById('themeSelect').value = localStorage.getItem('theme') || 'dark';
});

document.getElementById('themeSelect').addEventListener('change', function() {
    localStorage.setItem('theme', this.value);
    applyTheme(this.value);
});

window.addEventListener('DOMContentLoaded', function() {
    applyTheme(localStorage.getItem('theme') || 'dark');
});

function setLng(codes) {
    if (!Array.isArray(codes)) {
        console.error('codes is not an array:', codes);
        return;
    }
    codes.forEach(code => {
        // 言語コードに基づく処理を記述
        console.log('Processing language code:', code);
    });
}

// 洪水ハザードマップAPIの404エラーは、
// 「その地域・ズームレベルに該当するタイル画像が存在しない」ため発生します。
// これは国土地理院APIの仕様で、正常な挙動です。
// （例：山間部や海上など浸水想定区域がない場所・ズームでは404が返ります）

// プログラムでこのエラーを消すことはできませんが、
// 下記のようにユーザーへの通知や、開発者ツールのエラー抑制は可能です。

function setHazardMap(type) {
    // 既存ハザードマップを削除
    if (map.getLayer('hazard-map-layer')) {
        map.removeLayer('hazard-map-layer');
    }
    if (map.getSource('hazard-map')) {
        map.removeSource('hazard-map');
    }
    hazardMapVisible = false;

    // 洪水のみ表示
    if (type === 'flood' && HAZARD_MAP_TILES.flood) {
        map.addSource('hazard-map', {
            type: 'raster',
            tiles: [HAZARD_MAP_TILES.flood],
            tileSize: 256,
            attribution: "国土地理院 災害情報"
        });
        map.addLayer({
            id: 'hazard-map-layer',
            type: 'raster',
            source: 'hazard-map',
            paint: {}
        });
        hazardMapVisible = true;

        // 404エラー時のユーザー通知（1回のみ）
        map.on('error', function onError(e) {
            if (
                e && e.error && e.error.status === 404 &&
                e.sourceId === 'hazard-map'
            ) {
                alert('この地域・ズームレベルには洪水ハザードマップがありません。');
                map.off('error', onError); // 一度だけ通知
            }
        });
    }
    // 津波（従来）
    else if (type === 'tsunami' && HAZARD_MAP_TILES.tsunami) {
        map.addSource('hazard-map', {
            type: 'raster',
            tiles: [HAZARD_MAP_TILES.tsunami],
            tileSize: 256,
            attribution: "国土地理院 災害情報"
        });
        map.addLayer({
            id: 'hazard-map-layer',
            type: 'raster',
            source: 'hazard-map',
            paint: {}
        });
        hazardMapVisible = true;
        map.on('error', function onError(e) {
            if (
                e && e.error && e.error.status === 404 &&
                e.sourceId === 'hazard-map'
            ) {
                alert('この地域・ズームレベルには津波ハザードマップがありません。');
                map.off('error', onError);
            }
        });
    }
    // 新津波浸水想定（新凡例）
    else if (type === 'tsunami_newlegend' && HAZARD_MAP_TILES.tsunami_newlegend) {
        map.addSource('hazard-map', {
            type: 'raster',
            tiles: [HAZARD_MAP_TILES.tsunami_newlegend],
            tileSize: 256,
            attribution: "国土地理院 災害情報"
        });
        map.addLayer({
            id: 'hazard-map-layer',
            type: 'raster',
            source: 'hazard-map',
            paint: {}
        });
        hazardMapVisible = true;
        map.on('error', function onError(e) {
            if (
                e && e.error && e.error.status === 404 &&
                e.sourceId === 'hazard-map'
            ) {
                alert('この地域・ズームレベルには新津波ハザードマップがありません。');
                map.off('error', onError);
            }
        });
    }
}

// DOMContentLoaded イベントでドロップダウンのイベントリスナーを追加
window.addEventListener('DOMContentLoaded', function() {
    initMap();
    document.querySelectorAll('.hazard-map-select').forEach(el => {
        el.addEventListener('click', function(e) {
            e.preventDefault();
            setHazardMap(this.dataset.type);
        });
    });
    document.getElementById('clearMapButton').addEventListener('click', clearMapOverlays);

    // 現在地に戻るボタンのイベント
    const backToCurrentButton = document.getElementById('backToCurrentButton');
    if (backToCurrentButton) {
        backToCurrentButton.onclick = function() {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(function(pos) {
                    const lng = pos.coords.longitude;
                    const lat = pos.coords.latitude;
                    map.flyTo({ center: [lng, lat], zoom: 15 });
                }, function() {
                    alert('現在地を取得できませんでした');
                }, {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                });
            }
        };
    }
});

// 赤ピン・経路・徒歩時間・映像ピン・施設ピンの消去ボタン
function clearMapOverlays() {
    // 赤ピン
    if (currentMarker) {
        currentMarker.remove();
        currentMarker = null;
    }
    if (markers && markers.length > 0) {
        markers.forEach(m => m.remove());
        markers = [];
    }
    // 経路
    if (map.getLayer('osrm-route-layer')) {
        map.removeLayer('osrm-route-layer');
    }
    if (map.getSource('osrm-route-source')) {
        map.removeSource('osrm-route-source');
    }
    // 徒歩時間ポップアップ
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    // 映像ピン
    if (window.videoMarkers && Array.isArray(window.videoMarkers)) {
        window.videoMarkers.forEach(m => m.remove());
        window.videoMarkers = [];
    }
    // 施設ピン
    if (window.facilityMarkers && Array.isArray(window.facilityMarkers)) {
        window.facilityMarkers.forEach(m => m.remove());
        window.facilityMarkers = [];
    }
}