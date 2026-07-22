import { pool } from "./client.js";
import { catalogueExpansion } from "./catalogue-expansion.js";

type SeedRelease = {
  slug: string;
  title: string;
  originalTitle: string;
  description: string;
  posterUrl: string;
  bannerUrl: string | null;
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
  psychological: "Психология",
  thriller: "Триллер",
  sports: "Спорт",
  music: "Музыка",
  horror: "Ужасы",
  mecha: "Меха",
};

function placeholderEpisodes(count = 3): Array<{ number: number; title: string }> {
  return Array.from({ length: count }, (_, index) => ({
    number: index + 1,
    title: `Серия ${index + 1}`,
  }));
}

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
  {
    slug: "attack-on-titan-season-1",
    title: "Атака титанов",
    originalTitle: "Shingeki no Kyojin",
    description: "Человечество укрылось за стенами от титанов, но вековой покой заканчивается. Эрен, Микаса и Армин вступают в разведкорпус, чтобы узнать правду о мире за пределами города.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-buvcRTBx4NSm.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/16498-8jpFCOcDmneX.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2013,
    type: "series",
    status: "completed",
    total: 25,
    released: 25,
    rating: 9.0,
    age: "18+",
    genres: ["action", "drama", "fantasy", "mystery"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "demon-slayer-season-1",
    title: "Истребитель демонов",
    originalTitle: "Kimetsu no Yaiba",
    description: "Тандзиро отправляется на поиски лекарства для сестры, обращённой в демона. На пути ему предстоит стать охотником и столкнуться с теми, кто стоит за трагедией его семьи.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101922-WBsBl0ClmgYL.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/101922-33MtJGsUSxga.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2019,
    type: "series",
    status: "completed",
    total: 26,
    released: 26,
    rating: 8.5,
    age: "16+",
    genres: ["action", "adventure", "drama", "fantasy", "supernatural"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "jujutsu-kaisen-season-1",
    title: "Магическая битва",
    originalTitle: "Jujutsu Kaisen",
    description: "Старшеклассник Юдзи становится носителем опасного проклятия и попадает в мир магов. Чтобы защитить близких, ему придётся научиться сражаться с порождениями человеческого страха.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx113415-LHBAeoZDIsnF.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/113415-jQBSkxWAAk83.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2020,
    type: "series",
    status: "completed",
    total: 24,
    released: 24,
    rating: 8.6,
    age: "18+",
    genres: ["action", "drama", "supernatural"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "vinland-saga-season-1",
    title: "Сага о Винланде",
    originalTitle: "VINLAND SAGA",
    description: "Юный Торфинн растёт среди войн викингов и мечтает отомстить за отца. Его путь постепенно превращается в историю о цене насилия, свободе и поиске мирной земли.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101348-2fhDFPCuMNiz.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/101348-pivKKffCAwAY.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2019,
    type: "series",
    status: "completed",
    total: 24,
    released: 24,
    rating: 8.8,
    age: "18+",
    genres: ["action", "adventure", "drama"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "kaguya-sama-ultra-romantic",
    title: "Госпожа Кагуя: в любви как на войне — Ультра романтика",
    originalTitle: "Kaguya-sama wa Kokurasetai: Ultra Romantic",
    description: "Два лучших ученика академии любят друг друга, но считают признание поражением. Поэтому каждое свидание превращается в остроумную психологическую дуэль.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx125367-1yuq9NFcQuLI.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/125367-hGPJLSNfprO3.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2022,
    type: "series",
    status: "completed",
    total: 13,
    released: 13,
    rating: 8.7,
    age: "12+",
    genres: ["comedy", "psychological", "romance", "slice_of_life"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "bocchi-the-rock",
    title: "Одиночка-рокер!",
    originalTitle: "Bocchi the Rock!",
    description: "Застенчивая гитаристка Хитори мечтает играть на сцене. Неожиданное приглашение в группу заставляет её впервые выйти из своей комнаты и найти друзей.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx130003-HTDmeL4RGeJ4.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/130003-5F90a7BtsPQN.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2022,
    type: "series",
    status: "completed",
    total: 12,
    released: 12,
    rating: 8.5,
    age: "12+",
    genres: ["comedy", "music", "slice_of_life"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "cyberpunk-edgerunners",
    title: "Киберпанк: Бегущие по краю",
    originalTitle: "Cyberpunk: Edgerunners",
    description: "В городе будущего, где тело можно усилить за деньги, Дэвид выбирает опасную жизнь наёмника. У него появляется шанс стать легендой, но цена этой мечты слишком высока.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx120377-ayZPoxiWt4Li.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/120377-c15oLS8CA31s.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2022,
    type: "series",
    status: "completed",
    total: 10,
    released: 10,
    rating: 8.6,
    age: "18+",
    genres: ["action", "drama", "psychological", "sci_fi"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "steins-gate",
    title: "Врата Штейна",
    originalTitle: "Steins;Gate",
    description: "Несколько друзей случайно находят способ отправлять сообщения в прошлое. Игра со временем быстро превращается в гонку за спасение тех, кого они любят.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx9253-tIUXF2gfU8Sg.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/n9253-JIhmKgBKsWUN.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2011,
    type: "series",
    status: "completed",
    total: 24,
    released: 24,
    rating: 9.0,
    age: "16+",
    genres: ["drama", "psychological", "sci_fi", "thriller"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "fullmetal-alchemist-brotherhood",
    title: "Стальной алхимик: Братство",
    originalTitle: "Hagane no Renkinjutsushi: FULLMETAL ALCHEMIST",
    description: "Братья Элрики ищут философский камень, чтобы вернуть тела после неудачного запретного ритуала. Их путешествие раскрывает заговор, затрагивающий всю страну.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx5114-nSWCgQlmOMtj.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/5114-q0V5URebphSG.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2009,
    type: "series",
    status: "completed",
    total: 64,
    released: 64,
    rating: 9.2,
    age: "16+",
    genres: ["action", "adventure", "drama", "fantasy"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "death-note",
    title: "Тетрадь смерти",
    originalTitle: "DEATH NOTE",
    description: "Школьник Лайт получает тетрадь, способную убивать людей по имени. Его попытка создать идеальный мир приводит к интеллектуальной дуэли с загадочным детективом L.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1535-kUgkcrfOrkUM.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/1535.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2006,
    type: "series",
    status: "completed",
    total: 37,
    released: 37,
    rating: 8.9,
    age: "18+",
    genres: ["mystery", "psychological", "supernatural", "thriller"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "mob-psycho-100-season-1",
    title: "Моб Психо 100",
    originalTitle: "Mob Psycho 100",
    description: "У тихого школьника Моба огромная психическая сила, которую он старается не использовать. Но странные духи и сомнительный наставник постоянно втягивают его в новые проблемы.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21507-6YUSbh2m0N1p.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21507-Qx8bGsLXUgLo.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2016,
    type: "series",
    status: "completed",
    total: 12,
    released: 12,
    rating: 8.4,
    age: "12+",
    genres: ["action", "comedy", "drama", "psychological", "slice_of_life", "supernatural"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "haikyuu-season-1",
    title: "Волейбол!!",
    originalTitle: "Haikyuu!!",
    description: "Невысокий, но упрямый Хината создаёт школьную волейбольную команду вместе с бывшим соперником. Их цель — попасть на национальный турнир и доказать, что рост не решает всё.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20464-ooZUyBe4ptp9.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/20464-PpYjO9cPN1gs.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2014,
    type: "series",
    status: "completed",
    total: 25,
    released: 25,
    rating: 8.7,
    age: "12+",
    genres: ["comedy", "drama", "sports"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "violet-evergarden",
    title: "Вайолет Эвергарден",
    originalTitle: "Violet Evergarden",
    description: "После войны бывшая солдатка Вайолет становится автозапоминающей куклой и пишет письма за других. Так она постепенно учится понимать чувства и смысл последних слов командира.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21827-ubzq619ZA2E9.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21827-ROucgYiiiSpR.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2018,
    type: "series",
    status: "completed",
    total: 13,
    released: 13,
    rating: 8.6,
    age: "12+",
    genres: ["drama", "fantasy", "slice_of_life"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "made-in-abyss-season-1",
    title: "Созданный в Бездне",
    originalTitle: "Made in Abyss",
    description: "Рико мечтает повторить путь матери-исследовательницы и спуститься в огромную Бездну. Вместе с роботом Рэга она отправляется туда, где каждое возвращение наверх опасно.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx97986-TQ7dCgbS3y5s.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/97986-C55UnbJKB7ZF.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2017,
    type: "series",
    status: "completed",
    total: 13,
    released: 13,
    rating: 8.6,
    age: "18+",
    genres: ["adventure", "drama", "fantasy", "horror", "mystery", "sci_fi"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "your-name",
    title: "Твоё имя",
    originalTitle: "Kimi no Na wa.",
    description: "Двое незнакомых подростков начинают меняться телами и оставлять друг другу сообщения. Однажды связь обрывается, и им приходится искать путь через время и расстояние.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21519-SUo3ZQuCbYhJ.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21519-1ayMXgNlmByb.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2016,
    type: "movie",
    status: "completed",
    total: 1,
    released: 1,
    rating: 8.8,
    age: "12+",
    genres: ["drama", "romance", "supernatural"],
    episodes: placeholderEpisodes(1),
  },
  {
    slug: "a-silent-voice",
    title: "Форма голоса",
    originalTitle: "Koe no Katachi",
    description: "Повзрослевший Сёя пытается исправить ошибку детства и снова встретиться с одноклассницей, которую когда-то травил. Это история о вине, прощении и попытке услышать другого человека.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx20954-sYRfE5jQRtSB.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/20954-f30bHMXa5Qoe.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2016,
    type: "movie",
    status: "completed",
    total: 1,
    released: 1,
    rating: 8.7,
    age: "12+",
    genres: ["drama", "romance", "slice_of_life"],
    episodes: placeholderEpisodes(1),
  },
  {
    slug: "cowboy-bebop",
    title: "Ковбой Бибоп",
    originalTitle: "Cowboy Bebop",
    description: "Команда охотников за головами путешествует по солнечной системе на корабле «Бибоп». Каждое новое дело приносит деньги, неприятности и отголоски их прошлого.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-GCsPm7waJ4kS.png",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/1-OquNCNB6srGe.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 1998,
    type: "series",
    status: "completed",
    total: 26,
    released: 26,
    rating: 8.8,
    age: "16+",
    genres: ["action", "adventure", "drama", "sci_fi"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "one-punch-man-season-1",
    title: "Ванпанчмен",
    originalTitle: "One Punch Man",
    description: "Сайтама стал настолько сильным, что побеждает любого врага одним ударом. Но в мире героев даже абсолютная сила не гарантирует признания и интересной жизни.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21087-B5DHjqZ3kW4b.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/21087-sHb9zUZFsHe1.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2015,
    type: "series",
    status: "completed",
    total: 12,
    released: 12,
    rating: 8.5,
    age: "16+",
    genres: ["action", "comedy", "sci_fi", "supernatural"],
    episodes: placeholderEpisodes(),
  },
  {
    slug: "spirited-away",
    title: "Унесённые призраками",
    originalTitle: "Sen to Chihiro no Kamikakushi",
    description: "Тихиро попадает в мир духов, где её родителям грозит превращение в свиней. Чтобы вернуться домой, ей придётся работать в волшебной купальне и не забыть своё имя.",
    posterUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx199-sWefXJvXkDOb.jpg",
    bannerUrl: "https://s4.anilist.co/file/anilistcdn/media/anime/banner/199-Sm2RU5PSqw7T.jpg",
    trailerUrl: null,
    officialUrl: null,
    year: 2001,
    type: "movie",
    status: "completed",
    total: 1,
    released: 1,
    rating: 8.9,
    age: "6+",
    genres: ["adventure", "drama", "fantasy", "supernatural"],
    episodes: placeholderEpisodes(1),
  },
];

const catalogueColors = [
  ["#1b3557", "#72d7e8"],
  ["#542b62", "#f486b6"],
  ["#173b36", "#8ee1a1"],
  ["#533617", "#f0c75e"],
  ["#41213e", "#e88be8"],
  ["#203047", "#9bafff"],
] as const;

function escapeSvg(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[character] ?? character);
}

function cataloguePoster(title: string, index: number): string {
  const [start, end] = catalogueColors[index % catalogueColors.length] ?? catalogueColors[0];
  const label = escapeSvg(title);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 840">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${start}"/><stop offset="1" stop-color="${end}"/></linearGradient></defs>
    <rect width="600" height="840" fill="url(#g)"/>
    <circle cx="500" cy="125" r="205" fill="#ffffff" fill-opacity=".13"/>
    <circle cx="120" cy="695" r="250" fill="#090c12" fill-opacity=".22"/>
    <path d="M0 620 L600 350 L600 840 L0 840Z" fill="#090c12" fill-opacity=".35"/>
    <text x="48" y="68" fill="#ffffff" fill-opacity=".78" font-family="Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="4">ANITABIA</text>
    <text x="48" y="690" fill="#ffffff" font-family="Arial, sans-serif" font-size="39" font-weight="700">${label}</text>
    <text x="48" y="744" fill="#ffffff" fill-opacity=".72" font-family="Arial, sans-serif" font-size="18">КАТАЛОГ · ${String(index + 1).padStart(3, "0")}</text>
  </svg>`;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

releases.push(...catalogueExpansion.map((item, index): SeedRelease => ({
  slug: item.slug,
  title: item.title,
  originalTitle: item.originalTitle,
  description: `«${item.title}» — карточка расширенного каталога Anitabia. Добавьте авторизованное описание и официальные ссылки при подготовке к публикации.`,
  posterUrl: cataloguePoster(item.title, index),
  bannerUrl: null,
  trailerUrl: null,
  officialUrl: null,
  year: item.year,
  type: item.type ?? "series",
  status: item.status,
  total: item.total,
  released: item.released,
  rating: item.rating,
  age: item.age ?? "16+",
  genres: item.genres,
  episodes: placeholderEpisodes(item.type === "movie" ? 1 : Math.min(item.released, 3)),
})));

if (releases.length < 150) {
  throw new Error(`The catalogue must contain at least 150 releases, received ${releases.length}.`);
}

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

    for (const episode of item.episodes) {
      await pool.query(
        `INSERT INTO episodes (release_id, number, title, duration_seconds, published_at)
         VALUES ($1, $2, $3, 1440, NOW())
         ON CONFLICT (release_id, number) DO UPDATE SET
           title = EXCLUDED.title,
           duration_seconds = EXCLUDED.duration_seconds,
           published_at = EXCLUDED.published_at`,
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
