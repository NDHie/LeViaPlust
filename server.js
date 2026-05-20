const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

// --- CẤU HÌNH CÁC BỘ LỌC (Dựa trên tài liệu API KKPhim) ---
const GENRES = { "Hành Động": "hanh-dong", "Viễn Tưởng": "vien-tuong", "Kinh Dị": "kinh-di", "Tình Cảm": "tinh-cam", "Hài Hước": "hai-huoc", "Cổ Trang": "co-trang", "Tâm Lý": "tam-ly", "Hình Sự": "hinh-su" };
const COUNTRIES = { "Trung Quốc": "trung-quoc", "Hàn Quốc": "han-quoc", "Nhật Bản": "nhat-ban", "Thái Lan": "thai-lan", "Âu Mỹ": "au-my", "Việt Nam": "viet-nam" };
const YEARS = ["2024", "2023", "2022", "2021", "2020", "2019"];

const manifest = {
    id: "org.kkphim.ultimate",
    version: "3.0.0",
    name: "LeViaPlust",
    description: "LeViaPlust",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    idPrefixes: ["kkp_"],
    catalogs: [
        {
            type: "movie", id: "kkp_movie", name: "🎬 KKPhim: Phim Lẻ",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false, options: [...Object.keys(GENRES), ...Object.keys(COUNTRIES), ...YEARS] }
            ]
        },
        {
            type: "series", id: "kkp_series", name: "📺 KKPhim: Phim Bộ",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false, options: [...Object.keys(GENRES), ...Object.keys(COUNTRIES), ...YEARS] }
            ]
        }
    ]
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async ({ type, id, extra }) => {
    let apiUrl = "";
    
    // 1. Xử lý Tìm kiếm
    if (extra && extra.search) {
        apiUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(extra.search)}&limit=20`;
    } 
    // 2. Xử lý Danh mục & Bộ lọc
    else {
        const typeList = (id === "kkp_series") ? "phim-bo" : "phim-le";
        apiUrl = `https://phimapi.com/v1/api/danh-sach/${typeList}?limit=20`;

        if (extra && extra.genre) {
            if (GENRES[extra.genre]) apiUrl += `&category=${GENRES[extra.genre]}`;
            else if (COUNTRIES[extra.genre]) apiUrl += `&country=${COUNTRIES[extra.genre]}`;
            else if (!isNaN(extra.genre)) apiUrl += `&year=${extra.genre}`;
        }
    }

    try {
        const res = await fetch(apiUrl);
        const json = await res.json();
        
        // SỬA LỖI TẠI ĐÂY: Kiểm tra cả json.items và json.data.items
        const items = (json.data && json.data.items) ? json.data.items : (json.items || []);
        
        const metas = items.map(item => ({
            id: `kkp_${item.slug}`,
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

// --- META & STREAM HANDLER (Giữ nguyên logic ổn định) ---
builder.defineMetaHandler(async ({ id }) => {
    const slug = id.split(":")[0].replace("kkp_", "");
    try {
        const res = await fetch(`https://phimapi.com/phim/${slug}`);
        const data = await res.json();
        if (data.movie) {
            const m = data.movie;
            const isSeries = m.type === 'series' || m.type === 'hoathinh';
            let meta = {
                id: `kkp_${m.slug}`, type: isSeries ? "series" : "movie",
                name: m.name, description: m.content, poster: m.thumb_url, background: m.poster_url,
            };
            if (isSeries && data.episodes) {
                meta.videos = data.episodes[0].server_data.map((ep, i) => ({
                    id: `kkp_${m.slug}:${ep.slug}`, title: ep.name, season: 1, episode: i + 1
                }));
            }
            return { meta };
        }
    } catch (e) { return { meta: null }; }
});

builder.defineStreamHandler(async ({ id }) => {
    const parts = id.split(":");
    const slug = parts[0].replace("kkp_", "");
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
    } catch (e) { return { streams: [] }; }
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
