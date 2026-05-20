const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

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
