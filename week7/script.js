// This file contains the JavaScript code for controlling the functionality of the web page.

let map;
let markers = [];

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
});

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

            // ポップアップで所要時間を表示
            if (route.coordinates && route.coordinates.length > 1) {
                const midIndex = Math.floor(route.coordinates.length / 2);
                const midCoord = route.coordinates[midIndex];
                const popupText = `徒歩 約${durationMinutes}分`;
                new maplibregl.Popup({ closeOnClick: false, closeButton: false })
                    .setLngLat(midCoord)
                    .setHTML(`<div class="custom-popup">${popupText}</div>`)
                    .addTo(map);
            }
        } catch (err) {
            alert('経路取得に失敗しました');
            console.error(err);
        }
    }, function() {
        alert('現在地を取得できませんでした');
    });
}

function showMap(place) {
    markers.forEach(m => m.remove());
    markers = [];
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(place)}`)
        .then(res => res.json())
        .then(data => {
            if (data && data[0]) {
                const lng = parseFloat(data[0].lon);
                const lat = parseFloat(data[0].lat);
                map.flyTo({ center: [lng, lat], zoom: 14 });
                const marker = new maplibregl.Marker({ color: "red" })
                    .setLngLat([lng, lat])
                    .setPopup(new maplibregl.Popup().setHTML(`
                        <div>
                            <p>${place}</p>
                            <button id="routeButton" class="btn btn-sm btn-primary">ここまでのルートを表示</button>
                        </div>
                    `))
                    .addTo(map);
                markers.push(marker);

                // ボタンのクリックイベントを追加
                marker.getPopup().on('open', () => {
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

                // 地図をその場所へ移動
                map.flyTo({ center: [shelterLon, shelterLat], zoom: 14 });

                // 赤いピンを立てる
                new maplibregl.Marker({ color: "red" })
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
                <a href="https://aoisann.github.io/Aosa/01/" target="_blank" class="btn btn-sm btn-primary me-2">
                    サイトに飛ぶ
                </a>
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
    phoneList.innerHTML = `
        <li class="list-group-item bg-dark text-light d-flex justify-content-between align-items-center">
            <span>サイトリンク</span>
            <a href="https://aoisann.github.io/Aosa/01/" target="_blank" class="btn btn-sm btn-primary">
                サイトに飛ぶ
            </a>
        </li>
    `;
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