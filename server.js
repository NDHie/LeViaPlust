const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

// --- BỘ LỌC TỪ KHÓA (Đã bỏ lọc Năm) ---
const GENRES = { 
    "Hành Động": "hanh-dong", "Viễn Tưởng": "vien-tuong", "Kinh Dị": "kinh-di", 
    "Tình Cảm": "tinh-cam", "Hài Hước": "hai-huoc", "Cổ Trang": "co-trang", 
    "Tâm Lý": "tam-ly", "Hình Sự": "hinh-su" 
};
const COUNTRIES = { 
    "Trung Quốc": "trung-quoc", "Hàn Quốc": "han-quoc", "Nhật Bản": "nhat-ban", 
    "Thái Lan": "thai-lan", "Âu Mỹ": "au-my", "Việt Nam": "viet-nam" 
};

// --- CẤU HÌNH MANIFEST (Thương hiệu LeViaPlust) ---
const manifest = {
    id: "org.leviaplust.ultimate",
    version: "3.2.0",
    name: "LeViaPlust VN Ultimate",
    description: "Kho dữ liệu gộp Siêu Cấp - Không bỏ sót bất kỳ tựa nào!",
    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    idPrefixes: ["lvp_"],
    catalogs: [
        {
            type: "movie", id: "lvp_movie", name: "🎬 LeViaPlust: Lẻ",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false, options: [...Object.keys(GENRES), ...Object.keys(COUNTRIES)] }
            ]
        },
        {
            type: "series", id: "lvp_series", name: "📺 LeViaPlust: Bộ",
            extra: [
                { name: "search", isRequired: false },
                { name: "genre", isRequired: false, options: [...Object.keys(GENRES), ...Object.keys(COUNTRIES)] }
            ]
        }
    ]
};

const builder = new addonBuilder(manifest);

// --- HÀM HỖ TRỢ LẤY DỮ LIỆU ---
async function fetchJson(url) {
    try {
        const res = await fetch(url);
        return await res.json();
    } catch (e) {
        return null;
    }
}

// --- 1. CATALOG HANDLER (Xử lý Gộp danh sách 2 nguồn) ---
builder.defineCatalogHandler(async ({ type, id, extra }) => {
    let url1 = "";
    let url2 = "";
    const typeList = (id === "lvp_series") ? "phim-bo" : "phim-le";

    // Phân luồng link gọi API cho từng tác vụ
    if (extra && extra.search) {
        const keyword = encodeURIComponent(extra.search);
        url1 = `https://phimapi.com/v1/api/tim-kiem?keyword=${keyword}&limit=20`;
        url2 = `https://phim.nguonc.com/api/films/search?keyword=${keyword}`;
    } else {
        if (extra && extra.genre) {
            if (GENRES[extra.genre]) {
                const slug = GENRES[extra.genre];
                url1 = `https://phimapi.com/v1/api/danh-sach/${typeList}?category=${slug}&limit=20`;
                url2 = `https://phim.nguonc.com/api/films/the-loai/${slug}`;
            } else if (COUNTRIES[extra.genre]) {
                const slug = COUNTRIES[extra.genre];
                url1 = `https://phimapi.com/v1/api/danh-sach/${typeList}?country=${slug}&limit=20`;
                url2 = `https://phim.nguonc.com/api/films/quoc-gia/${slug}`;
            }
        } else {
            url1 = `https://phimapi.com/v1/api/danh-sach/${typeList}?limit=20`;
            url2 = `https://phim.nguonc.com/api/films/danh-sach/${typeList}`;
        }
    }

    // Tải dữ liệu song song từ cả 2 nguồn để tăng tốc độ
    const [data1, data2] = await Promise.all([fetchJson(url1), fetchJson(url2)]);
    
    let items = [];
    let slugs = new Set(); // Dùng để loại bỏ các tựa bị trùng

    const processData = (data) => {
        if (!data) return;
        const list = (data.data && data.data.items) ? data.data.items : (data.items || []);
        list.forEach(item => {
            if (!slugs.has(item.slug)) {
                slugs.add(item.slug);
                items.push(item);
            }
        });
    };

    processData(data1); // Đổ dữ liệu nguồn 1 vào
    processData(data2); // Đổ dữ liệu nguồn 2 vào (tự động lọc trùng)

    const metas = items.map(item => {
        let poster = item.poster_url || item.thumb_url || "";
        if (poster && !poster.startsWith('http')) poster = `https://phimimg.com/${poster}`;
        
        return {
            id: `lvp_${item.slug}`,
            type: type,
            name: item.name,
            poster: poster,
            description: `${item.origin_name || ''}`
        };
    });

    return { metas };
});

// --- 2. META HANDLER (Lấy chi tiết và danh sách tập) ---
builder.defineMetaHandler(async ({ id }) => {
    const slug = id.split(":")[0].replace("lvp_", "");
    
    // Gọi ưu tiên nguồn 1
    let data = await fetchJson(`https://phimapi.com/phim/${slug}`);

    // Nếu nguồn 1 bị lỗi hoặc không có, tự động gọi cứu viện bằng nguồn 2
    if (!data || !data.movie) {
        data = await fetchJson(`https://phim.nguonc.com/api/film/${slug}`);
    }

    if (data) {
        // Tương thích tên trường dữ liệu của cả 2 API
        const m = data.movie || data.film || data.item;
        if (!m) return { meta: null };

        const isSeries = m.type === 'series' || m.type === 'hoathinh';
        let poster = m.thumb_url || m.poster_url || "";
        if (poster && !poster.startsWith('http')) poster = `https://phimimg.com/${poster}`;
        
        let background = m.poster_url || m.thumb_url || "";
        if (background && !background.startsWith('http')) background = `https://phimimg.com/${background}`;

        let meta = {
            id: `lvp_${m.slug}`, 
            type: isSeries ? "series" : "movie",
            name: m.name, 
            description: m.content || m.origin_name, 
            poster: poster, 
            background: background,
        };

        const episodes = data.episodes || [];
        if (isSeries && episodes.length > 0 && episodes[0].server_data) {
            meta.videos = episodes[0].server_data.map((ep, i) => ({
                id: `lvp_${m.slug}:${ep.slug}`, 
                title: ep.name, 
                season: 1, 
                episode: i + 1
            }));
        }
        return { meta };
    }
    return { meta: null };
});

// --- 3. STREAM HANDLER (Gộp link phát từ cả 2 nguồn) ---
builder.defineStreamHandler(async ({ id }) => {
    const parts = id.split(":");
    const slug = parts[0].replace("lvp_", "");
    const epSlug = parts[1];
    
    // Khởi động lấy link cùng lúc từ cả Nguồn 1 và Nguồn 2
    const [data1, data2] = await Promise.all([
        fetchJson(`https://phimapi.com/phim/${slug}`),
        fetchJson(`https://phim.nguonc.com/api/film/${slug}`)
    ]);

    let streams = [];

    const extractStreams = (data, sourceName) => {
        if (!data || !data.episodes) return;
        data.episodes.forEach(sv => {
            if (sv.server_data) {
                sv.server_data.forEach(ep => {
                    // Trích xuất đúng tập người dùng chọn
                    if ((!epSlug || ep.slug === epSlug) && ep.link_m3u8) {
                        streams.push({ 
                            title: `▶ [${sourceName}] ${sv.server_name || 'VIP'}\nChất lượng tự động`, 
                            url: ep.link_m3u8 
                        });
                    }
                });
            }
        });
    };

    extractStreams(data1, "Server 1");
    extractStreams(data2, "Server 2");

    return { streams };
});

serveHTTP(builder.getInterface(), { port: process.env.PORT || 7000 });
