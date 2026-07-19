import { pool } from "./client.js";

type SeedRelease = {
  slug: string;
  title: string;
  originalTitle: string;
  description: string;
  posterUrl: string;
  bannerUrl: string;
  trailerUrl: string | null;
  officialUrl: string | null;
  year: number;
  type: "series" | "movie" | "ova" | "ona";
  status: "ongoing" | "completed" | "announced";
  total: number | null;
  released: number;
  rating: number;
  age: string;
  genres: string[];
  episodes: Array<{ number: number; title: string }>;
};

const genreNames: Record<string, string> = {
  action: "Экшен",
  adventure: "Приключения",
  fantasy: "Фэнтези",
  drama: "Драма",
  comedy: "Комедия",
  sci_fi: "Фантастика",
  romance: "Романтика",
  mystery: "Детектив",
  supernatural: "Сверхъестественное",
  slice_of_life: "Повседневность",
};

// Краткие оригинальные описания; видео ведёт только к официальному трейлеру/сервису.
const releases: SeedRelease[] = [
  {
    slug: "frieren-beyond-journeys-end",
    title: "Провожающая в последний путь Фрирен",
    originalTitle: "Sousou no Frieren",
    description: "Эльфийская волшебница проживает гораздо дольше своих друзей-героев. После их великого похода она отправляется в новое путешествие, чтобы научиться по-настоящему понимать людей и память о них.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-ivXNJ23SM1xB.jpg",
    trailerUrl: "https://www.youtube-nocookie.com/embed/n6HZo_33YaQ?rel=0",
    officialUrl: "https://www.crunchyroll.com/series/GG5H5XQX4/frieren-beyond-journeys-end",
    year: 2023,
    type: "series",
    status: "completed",
    total: 28,
    released: 28,
    rating: 9.1,
    age: "16+",
    genres: ["adventure", "drama", "fantasy"],
    episodes: [
      { number: 1, title: "Конец путешествия" },
      { number: 2, title: "Невозможно было бы убить одной лишь магией" },
      { number: 3, title: "Убийственная магия" },
      { number: 4, title: "Земля, где покоятся души" },
    ],
  },
  {
    slug: "spy-x-family-season-1",
    title: "Семья шпиона",
    originalTitle: "SPY×FAMILY",
    description: "Шпиону под прикрытием срочно нужна идеальная семья для новой миссии. Его приёмная дочь умеет читать мысли, а фиктивная жена скрывает собственную опасную профессию.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx140960-Kb6R5nYQfjmP.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/140960-Z7xSvkRxHKfj.jpg",
    trailerUrl: null,
    officialUrl: "https://www.crunchyroll.com/series/G4PH0WXVJ/spy-x-family",
    year: 2022,
    type: "series",
    status: "completed",
    total: 12,
    released: 12,
    rating: 8.5,
    age: "16+",
    genres: ["action", "comedy", "slice_of_life", "supernatural"],
    episodes: [
      { number: 1, title: "Операция «Стрикс»" },
      { number: 2, title: "Найти жену" },
      { number: 3, title: "Подготовка к собеседованию" },
      { number: 4, title: "Собеседование в престижной школе" },
    ],
  },
  {
    slug: "the-apothecary-diaries-season-1",
    title: "Монолог фармацевта",
    originalTitle: "Kusuriya no Hitorigoto",
    description: "Любознательная Маомао оказывается во внутреннем дворце и быстро замечает, что за придворными слухами прячутся настоящие загадки. Её знания лекарств и ядов оказываются полезнее, чем она рассчитывала.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx161645-QLbzHXiYRgV2.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/161645-oqzTZYIvviWI.jpg",
    trailerUrl: null,
    officialUrl: "https://www.crunchyroll.com/series/G3KHEVDJ7/the-apothecary-diaries",
    year: 2023,
    type: "series",
    status: "completed",
    total: 24,
    released: 24,
    rating: 8.8,
    age: "16+",
    genres: ["drama", "mystery"],
    episodes: [
      { number: 1, title: "Маомао" },
      { number: 2, title: "Успокаивающее лекарство" },
      { number: 3, title: "Неприятность" },
      { number: 4, title: "Угроза" },
    ],
  },
  {
    slug: "solo-leveling-season-1",
    title: "Поднятие уровня в одиночку",
    originalTitle: "Ore dake Level Up na Ken",
    description: "Слабейший охотник в мире выживает в смертельном подземелье и получает способность становиться сильнее после каждого задания. Теперь путь к вершине ему придётся пройти одному.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-it355ZgzquUd.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-37yfQA3ym8PA.jpg",
    trailerUrl: null,
    officialUrl: "https://www.crunchyroll.com/series/GDKHZEJ0K/solo-leveling",
    year: 2024,
    type: "series",
    status: "completed",
    total: 12,
    released: 12,
    rating: 8.6,
    age: "18+",
    genres: ["action", "adventure", "fantasy"],
    episodes: [
      { number: 1, title: "Я привык к этому" },
      { number: 2, title: "Если бы у меня был ещё один шанс" },
      { number: 3, title: "Это игра" },
      { number: 4, title: "Я должен стать сильнее" },
    ],
  },
  {
    slug: "dandadan-season-1",
    title: "Дандадан",
    originalTitle: "DAN DA DAN",
    description: "Момо верит в призраков, Окарун — в пришельцев. Одна авантюра доказывает, что они оба правы, и теперь им приходится разбираться со всем сверхъестественным вместе.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171018-60q1B6GK2Ghb.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/171018-SpwPNAduszXl.jpg",
    trailerUrl: null,
    officialUrl: "https://www.crunchyroll.com/series/GG5H5XQ0D/dan-da-dan",
    year: 2024,
    type: "series",
    status: "completed",
    total: 12,
    released: 12,
    rating: 8.3,
    age: "18+",
    genres: ["action", "comedy", "romance", "sci_fi", "supernatural"],
    episodes: [
      { number: 1, title: "Вот так появляется любовь" },
      { number: 2, title: "Это же инопланетянин, да?!" },
      { number: 3, title: "Как-то так и вышло" },
      { number: 4, title: "Пни танцующего серпоя" },
    ],
  },
];

async function seed() {
  for (const [slug, name] of Object.entries(genreNames)) {
    await pool.query(
      "INSERT INTO genres (slug, name) VALUES ($1, $2) ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name",
      [slug, name],
    );
  }

  for (const item of releases) {
    const releaseResult = await pool.query<{ id: string }>(
      `INSERT INTO releases (
        slug, title, original_title, description, poster_url, banner_url, trailer_url, official_url,
        release_year, release_type, status, episodes_total, episodes_released, rating, age_rating
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title, original_title = EXCLUDED.original_title,
        description = EXCLUDED.description, poster_url = EXCLUDED.poster_url,
        banner_url = EXCLUDED.banner_url, trailer_url = EXCLUDED.trailer_url,
        official_url = EXCLUDED.official_url, release_year = EXCLUDED.release_year,
        release_type = EXCLUDED.release_type, status = EXCLUDED.status,
        episodes_total = EXCLUDED.episodes_total, episodes_released = EXCLUDED.episodes_released,
        rating = EXCLUDED.rating, age_rating = EXCLUDED.age_rating, updated_at = NOW()
      RETURNING id`,
      [
        item.slug, item.title, item.originalTitle, item.description, item.posterUrl, item.bannerUrl,
        item.trailerUrl, item.officialUrl, item.year, item.type, item.status, item.total,
        item.released, item.rating, item.age,
      ],
    );
    const releaseId = releaseResult.rows[0]?.id;
    if (!releaseId) throw new Error(`Could not seed ${item.slug}`);

    await pool.query("DELETE FROM release_genres WHERE release_id = $1", [releaseId]);
    for (const genre of item.genres) {
      await pool.query(
        `INSERT INTO release_genres (release_id, genre_id)
         SELECT $1, id FROM genres WHERE slug = $2
         ON CONFLICT DO NOTHING`,
        [releaseId, genre],
      );
    }

    await pool.query("DELETE FROM episodes WHERE release_id = $1", [releaseId]);
    for (const episode of item.episodes) {
      await pool.query(
        `INSERT INTO episodes (release_id, number, title, duration_seconds, published_at)
         VALUES ($1, $2, $3, 1440, NOW())`,
        [releaseId, episode.number, episode.title],
      );
    }
  }

  console.log(`Seeded ${releases.length} real anime releases.`);
}

seed()
  .catch((error: unknown) => {
    console.error("Seeding failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
