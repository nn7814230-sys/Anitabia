# Anitabia

Стартовый full-stack проект каталога аниме-релизов. Интерфейс сделан с нуля и служит отправной точкой для развития сервиса: каталог, фильтрация, карточки релизов и страница просмотра.

## Стек

- **Клиент:** React 18, TypeScript, Vite
- **API:** Node.js, Fastify, TypeScript
- **База:** PostgreSQL 16, `pg`

## Быстрый старт

1. Скопируйте файл переменных: `Copy-Item .env.example .env`.
2. Запустите PostgreSQL: `docker compose up -d postgres`.
3. Установите пакеты: `npm.cmd install`.
4. Создайте таблицы и демонстрационные данные:

   ```powershell
   npm.cmd run db:migrate
   npm.cmd run db:seed
   ```

5. Запустите клиент и API: `npm.cmd run dev`.

Клиент будет доступен по адресу `http://localhost:5173`, API — по адресу `http://localhost:4000`.

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

## Структура

```text
apps/
  api/       Fastify API и SQL-скрипты
  web/       React-клиент
docker-compose.yml
```

Данные для наполнения находятся в `apps/api/src/database/seed.ts`; перед публикацией замените их на лицензированные данные и изображения.
