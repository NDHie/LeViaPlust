const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

// --- CẤU HÌNH CÁC BỘ LỌC (Đã bỏ lọc Năm) ---
const GENRES = { 
    "Hành Động": "hanh-dong", 
    "Viễn Tưởng": "vien-tuong", 
    "Kinh Dị": "kinh-di", 
    "Tình Cảm": "tinh-cam", 
    "Hài Hước": "hai-huoc", 
    "Cổ Trang": "co-trang", 
    "Tâm Lý": "tam-ly", 
    "Hình Sự": "hinh-su" 
};

const COUNTRIES = { 
    "Trung Quốc": "trung-quoc", 
    "Hàn Quốc": "han-quoc", 
    "Nhật Bản": "nhat-ban", 
    "Thái Lan": "thai-lan", 
    "Âu Mỹ": "au-my", 
    "Việt Nam": "viet-nam" 
};

// --- CẤU HÌNH MANIFEST (Đổi tên thương hiệu thành LeViaPlust) ---
const manifest = {
    id: "org.leviaplust.ultimate",
    version: "3.1.0",
    name: "LeViaPlust VN Ultimate",
    description: "LeViaPlust mới, LeViaPlust bộ, LeViaPlust lẻ, Hoạt hình (Full Filter)",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    idPrefixes: ["lvp_"], // Đổi tiền tố nhận diện thành lvp_
    catalogs: [
        {
            type: "movie", 
            id: "lvp_movie", 
            name: "🎬 LeViaPlust: LeViaPlust Lẻ",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false, options: [...Object.keys(GENRES), ...Object.keys(COUNTRIES)] }
            ]
        },
        {
            type: "series", 
            id: "lvp_series", 
            name: "📺 LeViaPlust: LeViaPlust Bộ",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false, options: [...Object.keys(GENRES), ...Object.keys(COUNTRIES)] }
            ]
        }
    ]
};

const builder = new addonBuilder(manifest);

// --- 1. CATALOG HANDLER ---
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    let apiUrl = "";
    
    // Xử lý Tìm kiếm
    if (extra && extra.search) {
        apiUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(extra.search)}&limit=20`;
    } 
    // Xử lý Danh mục & Bộ lọc Thể loại / Quốc gia
    else {
        const typeList = (id === "lvp_series") ? "phim-bo" : "phim-le";
        apiUrl = `https://phimapi.com/v1/api/danh-sach/${typeList}?limit=20`;

        if (extra && extra.genre) {
            if (GENRES[extra.genre]) apiUrl += `&category=${GENRES[extra.genre]}`;
            else if (COUNTRIES[extra.genre]) apiUrl += `&country=${COUNTRIES[extra.genre]}`;
        }
    }

    try {
        const res = await fetch(apiUrl);
        const json = await res.json();
        
        const items = (json.data && json.data.items) ? json.data.items : (json.items || []);
        
        const metas = items.map(item => ({
            id: `lvp_${item.slug}`,
            type: type,
            name: item.name,
            poster: item.poster_url.startsWith('http') ? item.poster_url : `https://phimimg.com/${item.poster_url}`,
            description: `${item.origin_name} (${item.year || ''})`
        }));
        
        return { metas };
    } catch (e) {
        return { metas: [] };
    }
});

// --- 2. META HANDLER ---
builder.defineMetaHandler(async ({ id }) => {
    const slug = id.split(":")[0].replace("lvp_", "");
    try {
        const res = await fetch(`https://phimapi.com/phim/${slug}`);
        const data = await res.json();
        if (data.movie) {
            const m = data.movie;
            const isSeries = m.type === 'series' || m.type === 'hoathinh';
            let meta = {
                id: `lvp_${m.slug}`, 
                type: isSeries ? "series" : "movie",
                name: m.name, 
                description: m.content, 
                poster: m.thumb_url, 
                background: m.poster_url,
            };
            if (isSeries && data.episodes) {
                meta.videos = data.episodes[0].server_data.map((ep, i) => ({
                    id: `lvp_${m.slug}:${ep.slug}`, 
                    title: ep.name, 
                    season: 1, 
                    episode: i + 1
                }));
            }
            return { meta };
        }
    } catch (e) { 
        return { meta: null }; 
    }
});

// --- 3. STREAM HANDLER ---
builder.defineStreamHandler(async ({ id }) => {
    const parts = id.split(":");
    const slug = parts[0].replace("lvp_", "");
    const epSlug = parts[1];
    try {
        const res = await fetch(`https://phimapi.com/phim/${slug}`);
        const data = await res.json();
        let streams = [];
        data.episodes.forEach(sv => {
            sv.server_data.forEach(ep => {
                if ((!epSlug || ep.slug === epSlug) && ep.link_m3u8) {
                    streams.push({ title: `${sv.server_name}\n${ep.name}`, url: ep.link_m3u8 });
                }
            });
        });
        return { streams };
    } catch (e) { 
        return { streams: [] }; 
    }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
