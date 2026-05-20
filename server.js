const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

// --- TỪ ĐIỂN MAP THỂ LOẠI (Stremio hiển thị tên -> Gửi API slug) ---
const GENRES = {
    "Hành Động": "hanh-dong",
    "Tình Cảm": "tinh-cam",
    "Hài Hước": "hai-huoc",
    "Kinh Dị": "kinh-di",
    "Viễn Tưởng": "vien-tuong",
    "Cổ Trang": "co-trang",
    "Hình Sự": "hinh-su",
    "Tài Liệu": "tai-lieu"
};

// --- CẤU HÌNH MANIFEST ---
const manifest = {
    id: "org.LeViaPlust.stremio.pro",
    version: "2.0.0",
    name: "LeViaPlust",
    description: "LeViaPlust",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    idPrefixes: ["kkp_"],
    catalogs: [
        {
            type: "movie",
            id: "kkp_phim_le",
            name: "🎬 Phim Lẻ",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false, options: Object.keys(GENRES) }
            ]
        },
        {
            type: "series",
            id: "kkp_phim_bo",
            name: "📺 Phim Bộ",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false, options: Object.keys(GENRES) }
            ]
        },
        {
            type: "series",
            id: "kkp_hoat_hinh",
            name: "🦄 Hoạt Hình / Anime",
            extra: [
                { name: "search", isRequired: false }
            ]
        }
    ]
};

const builder = new addonBuilder(manifest);

// --- 1. CATALOG HANDLER (Xử lý Tìm kiếm & Thể loại) ---
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    let apiUrl = "";
    
    // Nếu người dùng gõ vào thanh Tìm Kiếm của Stremio
    if (extra && extra.search) {
        apiUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(extra.search)}&limit=30`;
    } 
    // Nếu người dùng không tìm kiếm, tải danh sách mặc định hoặc lọc theo Thể Loại
    else {
        let typeList = "phim-le";
        if (id === "kkp_phim_bo") typeList = "phim-bo";
        if (id === "kkp_hoat_hinh") typeList = "hoat-hinh";

        apiUrl = `https://phimapi.com/v1/api/danh-sach/${typeList}?limit=30`;
        
        // Nếu chọn lọc theo thể loại (Genre)
        if (extra && extra.genre && GENRES[extra.genre]) {
            apiUrl += `&category=${GENRES[extra.genre]}`;
        }
    }

    try {
        const res = await fetch(apiUrl);
        const data = await res.json();
        
        // API v1 của KKPhim trả về data.data.items cho danh sách và tìm kiếm
        const items = data.data?.items || data.items || [];
        
        let metas = items.map(item => ({
            id: `kkp_${item.slug}`,
            // Phân loại cho Stremio hiểu đâu là phim lẻ, đâu là phim bộ
            type: (item.type === 'series' || item.type === 'hoathinh') ? "series" : "movie", 
            name: item.name,
            poster: `https://phimimg.com/${item.poster_url}`, // API v1 đôi khi trả link ảnh tương đối
            description: `${item.origin_name} (${item.year})`
        }));
        
        return { metas };
    } catch (e) {
        console.error("Lỗi Catalog:", e);
        return { metas: [] };
    }
});

// --- 2. META HANDLER (Giữ nguyên như bản cũ - Lấy chi tiết & danh sách tập) ---
builder.defineMetaHandler(async ({ type, id }) => {
    if (id.startsWith("kkp_")) {
        const slug = id.split(":")[0].replace("kkp_", "");
        
        try {
            const res = await fetch(`https://phimapi.com/phim/${slug}`);
            const data = await res.json();
            
            if (data.status && data.movie) {
                const m = data.movie;
                const isSeries = m.type === 'series' || m.type === 'hoathinh' || data.episodes[0]?.server_data.length > 1;
                
                let meta = {
                    id: id.split(":")[0],
                    type: isSeries ? "series" : "movie",
                    name: m.name,
                    description: m.content || m.origin_name,
                    poster: m.thumb_url,
                    background: m.poster_url,
                    releaseInfo: m.year ? m.year.toString() : ""
                };

                if (isSeries && data.episodes && data.episodes.length > 0) {
                    const server = data.episodes[0].server_data;
                    meta.videos = server.map((ep, index) => ({
                        id: `kkp_${slug}:${ep.slug}`,
                        title: ep.name,
                        season: 1,
                        episode: index + 1
                    }));
                }
                return { meta };
            }
        } catch (e) {
            console.error("Lỗi Meta:", e);
        }
    }
    return { meta: null };
});

// --- 3. STREAM HANDLER (Giữ nguyên như bản cũ - Lấy luồng m3u8) ---
builder.defineStreamHandler(async ({ type, id }) => {
    if (id.startsWith("kkp_")) {
        const parts = id.split(":");
        const slug = parts[0].replace("kkp_", "");
        const epSlug = parts[1];
        
        try {
            const res = await fetch(`https://phimapi.com/phim/${slug}`);
            const data = await res.json();
            
            let streams = [];
            if (data.status && data.episodes) {
                data.episodes.forEach(server => {
                    server.server_data.forEach(ep => {
                        if ((!epSlug || ep.slug === epSlug) && ep.link_m3u8) {
                            streams.push({
                                title: `▶ ${server.server_name} (Auto)\n${ep.name}`,
                                url: ep.link_m3u8
                            });
                        }
                    });
                });
            }
            return { streams };
        } catch (e) {
            console.error("Lỗi Stream:", e);
        }
    }
    return { streams: [] };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

// --- CẤU HÌNH MANIFEST ---
const manifest = {
    id: "org.leviaplust.stremio",
    version: "1.0.0",
    name: "leviaplust",
    description: "leviaplust",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    idPrefixes: ["kkp_"],
    catalogs: [
        {
            type: "movie",
            id: "kkp_phim_moi",
            name: "🔥 Phim Mới Cập Nhật"
        }
    ]
};

const builder = new addonBuilder(manifest);

// --- 1. CATALOG HANDLER (Lấy danh sách phim mới) ---
builder.defineCatalogHandler(async ({ type, id }) => {
    if (id === "kkp_phim_moi") {
        try {
            const res = await fetch("https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1");
            const data = await res.json();
            
            let metas = [];
            if (data.items) {
                metas = data.items.map(item => ({
                    id: `kkp_${item.slug}`,
                    type: "movie", 
                    name: item.name,
                    poster: item.thumb_url || item.poster_url,
                    description: item.origin_name
                }));
            }
            return { metas };
        } catch (e) {
            console.error("Lỗi Catalog:", e);
            return { metas: [] };
        }
    }
    return { metas: [] };
});

// --- 2. META HANDLER (Lấy thông tin chi tiết và danh sách tập phim) ---
builder.defineMetaHandler(async ({ type, id }) => {
    if (id.startsWith("kkp_")) {
        // Cắt bỏ phần kkp_ để lấy slug chính xác của phim
        const slug = id.split(":")[0].replace("kkp_", "");
        
        try {
            const res = await fetch(`https://phimapi.com/phim/${slug}`);
            const data = await res.json();
            
            if (data.status && data.movie) {
                const m = data.movie;
                // Kiểm tra xem đây là phim lẻ hay phim bộ (nhiều tập)
                const isSeries = m.type === 'series' || m.type === 'hoathinh' || data.episodes[0]?.server_data.length > 1;
                
                let meta = {
                    id: id.split(":")[0],
                    type: isSeries ? "series" : "movie",
                    name: m.name,
                    description: m.content || m.origin_name,
                    poster: m.thumb_url,
                    background: m.poster_url,
                    releaseInfo: m.year ? m.year.toString() : ""
                };

                // Nếu là phim bộ, khởi tạo Menu chọn tập phim
                if (isSeries && data.episodes && data.episodes.length > 0) {
                    const server = data.episodes[0].server_data;
                    meta.videos = server.map((ep, index) => ({
                        id: `kkp_${slug}:${ep.slug}`,
                        title: ep.name,
                        season: 1,
                        episode: index + 1
                    }));
                }
                return { meta };
            }
        } catch (e) {
            console.error("Lỗi Meta:", e);
        }
    }
    return { meta: null };
});

// --- 3. STREAM HANDLER (Lấy link M3U8 để phát) ---
builder.defineStreamHandler(async ({ type, id }) => {
    if (id.startsWith("kkp_")) {
        const parts = id.split(":");
        const slug = parts[0].replace("kkp_", "");
        const epSlug = parts[1]; // Dùng để xác định người dùng đang bấm vào tập nào
        
        try {
            const res = await fetch(`https://phimapi.com/phim/${slug}`);
            const data = await res.json();
            
            let streams = [];
            if (data.status && data.episodes) {
                data.episodes.forEach(server => {
                    server.server_data.forEach(ep => {
                        // Trích xuất link m3u8 ứng với tập phim đã chọn
                        if ((!epSlug || ep.slug === epSlug) && ep.link_m3u8) {
                            streams.push({
                                title: `[${server.server_name}]\n${ep.name}`,
                                url: ep.link_m3u8
                            });
                        }
                    });
                });
            }
            return { streams };
        } catch (e) {
            console.error("Lỗi Stream:", e);
        }
    }
    return { streams: [] };
});

// --- KHỞI CHẠY SERVER ---
serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
