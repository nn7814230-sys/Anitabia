# Anitabia

Стартовый full-stack проект каталога аниме-релизов. Интерфейс сделан с нуля и служит отправной точкой для развития сервиса: каталог, фильтрация, карточки релизов и страница просмотра.

## Стек

- **Клиент:** React 18, TypeScript, Vite
- **API:** Node.js, Fastify, TypeScript
- **База:** PostgreSQL 16, `pg`

## Быстрый старт

### Всё в Docker

Чтобы запустить сайт, API и PostgreSQL одной командой, выполните:

```powershell
docker compose up --build
```

Для размещения на сервере с доменом `anitabia.ru` Docker Compose поднимает Caddy и автоматически получает TLS-сертификат. Перед первым запуском настройте A-запись `anitabia.ru` на публичный IP сервера и откройте входящие порты 80 и 443. Затем выполните:

```powershell
docker compose up --build -d
```

Сайт будет доступен по адресу `https://anitabia.ru`. Контейнер API самостоятельно применит миграции и загрузит стартовый каталог. Для остановки используйте `docker compose down`; данные PostgreSQL останутся в Docker volume. PostgreSQL привязан только к `127.0.0.1:5433` и не открыт в интернет.

Чтобы один раз заменить временные обложки на постеры AniList, после запуска контейнеров выполните:

```powershell
docker compose exec api node apps/api/dist/scripts/sync-anilist-artwork.js
```

Синхронизация идёт с безопасной скоростью и может занять около шести минут. Она не запускается при рестарте контейнеров.

### Локальная разработка

1. Скопируйте файл переменных: `Copy-Item .env.example .env`.
2. Запустите PostgreSQL: `docker compose up -d postgres`.
3. Установите пакеты: `npm.cmd install`.
4. Создайте таблицы и демонстрационные данные:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run db:seed
   npm.cmd run artwork:sync
   ```

5. Запустите клиент и API: `npm.cmd run dev`.

Клиент будет доступен по адресу `http://localhost:5173`, API — по адресу `http://localhost:4000`.
PostgreSQL проекта доступен на `localhost:5433`: порт `5432` оставлен свободным для существующей локальной базы данных.

## API

- `GET /health` — состояние сервиса.
- `GET /api/v1/releases` — список релизов; поддерживаются `search`, `genre`, `status`, `limit`.
- `GET /api/v1/releases/:slug` — релиз и его эпизоды.

## Плеер и права на видео

На странице релиза кнопка «Открыть плеер» ведёт на отдельный экран просмотра.

- `trailer_url` отображает официальный трейлер через безопасный YouTube embed.
- `official_url` открывает страницу лицензированного партнёра, если видеоэпизод не загружен в Anitabia.
- `episodes.video_url` зарезервирован для ваших MP4-файлов или URL лицензированного видеопровайдера. Не добавляйте туда неавторизованные копии серий.

Сиды содержат реальные тайтлы и их метаданные. После обновления проекта снова выполните миграцию и сидирование:

```powershell
npm.cmd run db:migrate
npm.cmd run db:seed
```

## Временный Cloudflare Stream

Cloudflare Stream подключён как изолированный временный провайдер. Он воспроизводит только видео, которые вы загрузили в свой аккаунт Cloudflare Stream или на которые у вас есть права.

1. В Cloudflare Dashboard откройте **Stream** и скопируйте Customer Code из embed-кода. Укажите его в `.env`:

   ```dotenv
   CLOUDFLARE_STREAM_CUSTOMER_CODE=ваш_код
   ```

2. Загрузите видео в Cloudflare Stream и скопируйте UID готового к просмотру видео.
3. Привяжите UID к существующему эпизоду:

   ```powershell
   npm.cmd run stream:attach -- --release frieren-beyond-journeys-end --episode 1 --uid UID_ИЗ_CLOUDFLARE
   ```

После перезапуска API эпизод будет отображать официальный Cloudflare Stream Player. Поставщик изолирован в `apps/api/src/modules/playback/cloudflare.ts`: при переходе на иной сервис его можно заменить или удалить без изменения каталога и интерфейса.

## Структура

```text
apps/
  api/       Fastify API и SQL-скрипты
  web/       React-клиент
docker-compose.yml
```

Данные для наполнения находятся в `apps/api/src/database/seed.ts`; перед публикацией замените их на лицензированные данные и изображения.
