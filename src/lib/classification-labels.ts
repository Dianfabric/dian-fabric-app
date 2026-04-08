/**
 * CLIP 텍스트-이미지 분류용 라벨 정의
 * 각 카테고리에 5~8개 프롬프트로 앙상블. 시각적 특징을 구체적으로 묘사.
 *
 * 참고: 인터넷 리서치 기반으로 패턴별 고유 시각적 특징 반영
 * - 하운드투스 vs 헤링본: 뾰족한 별 체크 vs 엇갈린 V자 지그재그
 * - 부클: 3D 루프 질감 (기하학 패턴 없음)
 * - 스트라이프 vs 체크: 한 방향 vs 교차 격자
 */

export const PATTERN_LABELS: Record<string, string[]> = {
  "무지": [
    "a solid color fabric with no pattern, smooth uniform single tone",
    "plain monochrome upholstery fabric, flat even texture without any design",
    "single color fabric swatch, no stripes no checks no motifs",
    "uniform dyed textile, one solid color throughout",
    "simple plain fabric with consistent color and no visible pattern",
  ],
  "벨벳": [
    "velvet fabric with soft pile texture, luxurious sheen and depth",
    "plush velvet upholstery with light reflecting off soft dense fibers",
    "crushed velvet textile showing light and shadow on pile surface",
    "rich velvet material with characteristic soft nap and luster",
    "velvety smooth fabric with dense short pile giving shimmer effect",
  ],
  "스웨이드": [
    "suede fabric with matte brushed texture like soft leather",
    "microfiber suede textile with fine napped surface, no shine",
    "suede-like fabric with soft matte finish resembling brushed animal hide",
    "faux suede material with characteristic velvety matte hand feel",
  ],
  "인조가죽": [
    "faux leather fabric with smooth glossy surface and slight texture",
    "synthetic leather material, artificial leather grain visible",
    "PU leather fabric with smooth surface imitating real leather",
    "vinyl leatherette upholstery with leather-like grain pattern",
  ],
  "린넨": [
    "linen fabric with natural slub texture and visible fiber weave",
    "natural linen textile with irregular woven threads showing",
    "linen-like fabric with organic rough texture and breathable weave",
    "woven linen material showing natural flax fiber irregularities",
  ],
  "자카드": [
    "jacquard woven fabric with intricate raised pattern woven into textile",
    "damask jacquard upholstery with tone-on-tone woven design",
    "jacquard fabric showing complex woven geometric or floral motif",
    "brocade jacquard material with elaborate interwoven decorative pattern",
  ],
  "시어": [
    "sheer transparent lightweight fabric you can see through",
    "translucent thin curtain fabric with light passing through",
    "voile organza sheer textile that is semi-transparent and airy",
    "gauzy lightweight see-through fabric for curtains",
  ],
  "부클": [
    "boucle fabric with three-dimensional bumpy looped surface texture, no geometric pattern",
    "nubby boucle textile with raised curly loops protruding from surface, bubbly popcorn-like",
    "thick boucle weave with irregular small round knots and curled fibers, plush cushioned uneven terrain",
    "soft pillowy boucle material with visible raised loop texture, not flat not patterned with lines",
    "boucle upholstery with characteristic protruding loops creating bumpy pebbly surface, purely textural",
  ],
  "하운드투스": [
    "houndstooth pattern with jagged four-pointed star checks in high contrast two-tone",
    "broken check pattern with tooth-shaped notched edges, abstract checkerboard",
    "two-tone tessellated pattern with diagonal jagged teeth, not smooth squares",
    "classic houndstooth dogstooth motif with pointed angular shapes repeating",
    "high-contrast black and white jagged check pattern with star-like motifs, not zigzag lines",
  ],
  "스트라이프": [
    "striped fabric with parallel lines running in one direction only, no crossing grid",
    "vertical or horizontal stripe pattern with alternating color bands, unidirectional",
    "pinstripe or wide stripe with straight continuous parallel lines, not a plaid grid",
    "bold striped textile with evenly spaced linear bands, lines go one way only",
    "linear stripe pattern with consistent parallel lines, no perpendicular crossing",
  ],
  "체크": [
    "checkered plaid fabric with perpendicular grid of crossing vertical and horizontal lines forming squares",
    "tartan plaid pattern with intersecting colored stripes creating layered grid of squares",
    "gingham buffalo check with clean straight-edged squares, no jagged tooth notches",
    "plaid grid pattern with both vertical and horizontal bands crossing to form rectangles",
    "checked pattern with smooth square blocks from intersecting perpendicular lines, not one-direction stripes",
  ],
  "헤링본": [
    "herringbone pattern with broken staggered V-shaped zigzag columns, low contrast tonal",
    "fish bone weave pattern with parallel diagonal lines reversing direction column by column",
    "subtle herringbone twill with offset V-shapes, not star checks, not smooth zigzag",
    "tonal two-color herringbone with staggered broken zigzag, softer than houndstooth",
    "herringbone weave showing rows of slanted lines that reverse at staggered break points, not continuous chevron",
  ],
  "추상": [
    "abstract artistic pattern fabric with non-representational creative design",
    "modern abstract print textile with irregular shapes and artistic composition",
    "contemporary abstract fabric with geometric or organic artistic motifs",
    "artistic abstract pattern material with creative non-figurative design",
  ],
  "자연": [
    "nature-inspired scenic pattern fabric with landscape mountain water imagery",
    "natural landscape print textile showing trees sky clouds nature scenes",
    "nature themed fabric pattern with outdoor scenery and natural elements",
    "scenic nature print material with realistic natural world imagery",
  ],
  "동물": [
    "animal print fabric with leopard spots, zebra stripes, or snake skin pattern",
    "animal skin pattern textile showing leopard cheetah spots or tiger stripes",
    "wild animal print material with safari-style predator skin patterns",
    "faux animal hide pattern fabric like leopard, zebra, crocodile, or python",
  ],
  "식물": [
    "floral botanical print fabric with flowers leaves and plant designs",
    "flower pattern textile with roses, petals, botanical garden imagery",
    "botanical leaf and flower printed fabric with natural plant motifs",
    "tropical or garden floral fabric showing detailed flower and foliage designs",
    "plant pattern material with leaf vine flower botanical illustrations",
  ],
  "큰패턴": [
    "large scale bold pattern fabric with big oversized decorative motifs",
    "dramatic large print textile with prominent big repeated design elements",
    "oversized pattern material with large eye-catching graphic designs",
    "bold large motif fabric with statement-making big pattern repeats",
  ],
};

export const COLOR_LABELS: Record<string, string[]> = {
  "화이트": [
    "pure white bright clean fabric, snow white color",
    "white colored textile material, bright and clean without any tint",
    "crisp white fabric, bright pure white tone",
  ],
  "아이보리": [
    "ivory cream off-white fabric with warm yellowish white tone",
    "ivory colored textile, slightly warm white with cream undertone",
    "off-white cream fabric, warmer than pure white with subtle yellow",
  ],
  "베이지": [
    "beige tan sand colored fabric, warm neutral light brown tone",
    "beige fabric with sandy warm neutral color, between cream and light brown",
    "tan khaki beige textile, muted warm earthy light tone",
  ],
  "브라운": [
    "brown chocolate coffee colored fabric, dark warm earth tone",
    "deep brown fabric, rich chocolate or walnut colored textile",
    "dark brown material, warm chestnut or espresso brown shade",
  ],
  "그레이": [
    "gray grey colored fabric, neutral cool medium tone between black and white",
    "grey fabric, silver charcoal or medium neutral grey tone",
    "gray textile material in cool neutral tone, not warm not cool",
  ],
  "차콜": [
    "dark charcoal grey fabric, very dark grey almost black",
    "charcoal colored textile, deep dark grey with subtle warmth",
    "dark grey nearly black fabric, anthracite charcoal shade",
  ],
  "블랙": [
    "pure black dark fabric, deep solid black color",
    "jet black colored textile, darkest black tone material",
    "solid black fabric, dark as night without any color tint",
  ],
  "네이비": [
    "navy dark blue fabric, deep dark midnight blue color",
    "navy blue textile, very dark blue like deep ocean at night",
    "dark navy fabric, deep rich blue darker than royal blue",
  ],
  "블루": [
    "blue colored fabric, medium bright blue sky or cobalt tone",
    "blue textile material, clear blue like sky or ocean surface",
    "bright blue fabric, vivid medium blue color",
  ],
  "그린": [
    "green colored fabric, forest emerald or olive green tone",
    "green textile, natural green like leaves grass or moss",
    "green material in emerald olive sage or forest shade",
  ],
  "레드": [
    "red colored fabric, bright crimson scarlet or burgundy tone",
    "red textile material, vivid warm red from cherry to wine",
    "deep red fabric, rich red crimson or dark wine shade",
  ],
  "핑크": [
    "pink colored fabric, soft rose blush or salmon pink tone",
    "pink textile, light feminine pink from pastel to hot pink",
    "pink material, gentle rosy blush colored fabric",
  ],
  "옐로우": [
    "yellow colored fabric, bright sunny golden yellow tone",
    "yellow textile material, warm bright cheerful yellow shade",
    "golden yellow fabric, from pale lemon to rich mustard",
  ],
  "오렌지": [
    "orange colored fabric, warm tangerine amber or rust tone",
    "orange textile material, warm between red and yellow",
    "orange fabric, from bright tangerine to muted terracotta",
  ],
  "퍼플": [
    "purple violet colored fabric, rich plum lavender or aubergine",
    "purple textile material, from light lavender to deep plum",
    "violet purple fabric, regal deep purple or soft lilac shade",
  ],
  "민트": [
    "mint green aqua turquoise colored fabric, cool light blue-green",
    "mint teal textile, fresh light green with blue undertone",
    "turquoise aqua fabric, cool refreshing blue-green pastel",
  ],
};

// DB CHECK 제약조건에 맞는 fabric_type 값
export const ALLOWED_FABRIC_TYPES = ["무지", "벨벳", "패턴", "스웨이드", "인조가죽"];

// 패턴 하위 카테고리 (fabric_type = "패턴"으로 설정됨)
export const SUB_PATTERN_TYPES = [
  "부클", "하운드투스", "스트라이프", "체크", "헤링본",
  "추상", "자연", "동물", "식물", "큰패턴",
];
