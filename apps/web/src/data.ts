import type { Release } from "./types";

// Резервный каталог отображается, пока локальный API и PostgreSQL не запущены.
export const demoReleases: Release[] = [
  {
    id: "frieren", slug: "frieren-beyond-journeys-end", title: "Провожающая в последний путь Фрирен", originalTitle: "Sousou no Frieren",
    description: "Эльфийская волшебница проживает дольше своих друзей-героев и отправляется в новое путешествие, чтобы понять людей и память о них.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx154587-qQTzQnEJJ3oB.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587-ivXNJ23SM1xB.jpg",
    trailerUrl: "https://www.youtube-nocookie.com/embed/n6HZo_33YaQ?rel=0",
    officialUrl: "https://www.crunchyroll.com/series/GG5H5XQX4/frieren-beyond-journeys-end",
    releaseYear: 2023, releaseType: "series", status: "completed", episodesTotal: 28, episodesReleased: 28,
    rating: 9.1, ageRating: "16+", genres: ["Приключения", "Драма", "Фэнтези"],
  },
  {
    id: "spy-family", slug: "spy-x-family-season-1", title: "Семья шпиона", originalTitle: "SPY×FAMILY",
    description: "Шпиону нужна идеальная семья для миссии, но дочь читает мысли, а жена скрывает опасную профессию.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx140960-Kb6R5nYQfjmP.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/140960-Z7xSvkRxHKfj.jpg",
    trailerUrl: null, officialUrl: "https://www.crunchyroll.com/series/G4PH0WXVJ/spy-x-family",
    releaseYear: 2022, releaseType: "series", status: "completed", episodesTotal: 12, episodesReleased: 12,
    rating: 8.5, ageRating: "16+", genres: ["Экшен", "Комедия", "Повседневность", "Сверхъестественное"],
  },
  {
    id: "apothecary", slug: "the-apothecary-diaries-season-1", title: "Монолог фармацевта", originalTitle: "Kusuriya no Hitorigoto",
    description: "Маомао оказывается во внутреннем дворце, где её знание лекарств и ядов помогает распутывать придворные тайны.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx161645-QLbzHXiYRgV2.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/161645-oqzTZYIvviWI.jpg",
    trailerUrl: null, officialUrl: "https://www.crunchyroll.com/series/G3KHEVDJ7/the-apothecary-diaries",
    releaseYear: 2023, releaseType: "series", status: "completed", episodesTotal: 24, episodesReleased: 24,
    rating: 8.8, ageRating: "16+", genres: ["Драма", "Детектив"],
  },
  {
    id: "solo-leveling", slug: "solo-leveling-season-1", title: "Поднятие уровня в одиночку", originalTitle: "Ore dake Level Up na Ken",
    description: "Слабейший охотник выживает в подземелье и получает способность становиться сильнее после каждого задания.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-it355ZgzquUd.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/151807-37yfQA3ym8PA.jpg",
    trailerUrl: null, officialUrl: "https://www.crunchyroll.com/series/GDKHZEJ0K/solo-leveling",
    releaseYear: 2024, releaseType: "series", status: "completed", episodesTotal: 12, episodesReleased: 12,
    rating: 8.6, ageRating: "18+", genres: ["Экшен", "Приключения", "Фэнтези"],
  },
  {
    id: "dandadan", slug: "dandadan-season-1", title: "Дандадан", originalTitle: "DAN DA DAN",
    description: "Момо верит в призраков, Окарун — в пришельцев. Одна авантюра доказывает, что они оба правы.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171018-60q1B6GK2Ghb.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/171018-SpwPNAduszXl.jpg",
    trailerUrl: null, officialUrl: "https://www.crunchyroll.com/series/GG5H5XQ0D/dan-da-dan",
    releaseYear: 2024, releaseType: "series", status: "completed", episodesTotal: 12, episodesReleased: 12,
    rating: 8.3, ageRating: "18+", genres: ["Экшен", "Комедия", "Романтика", "Фантастика", "Сверхъестественное"],
  },
];
