#!/bin/sh
set -eu

project_dir=/home/anitabia
tag_file="$project_dir/.deploy-image-tag"

IFS= read -r registry_user

if [ "$registry_user" = probe ]; then
  echo "anitabia-deploy-ready"
  exit 0
fi

IFS= read -r registry_token
IFS= read -r new_tag

case "$registry_user" in
  ''|*[!A-Za-z0-9_-]*)
    echo "Invalid registry user" >&2
    exit 1
    ;;
esac

case "$new_tag" in
  *[!0-9a-f]*|'')
    echo "Invalid image tag" >&2
    exit 1
    ;;
esac

if [ "${#new_tag}" -ne 40 ] || [ -z "$registry_token" ]; then
  echo "Invalid deployment payload" >&2
  exit 1
fi

cleanup() {
  docker logout ghcr.io >/dev/null 2>&1 || true
  unset registry_token
}
trap cleanup EXIT HUP INT TERM

printf '%s' "$registry_token" | docker login ghcr.io -u "$registry_user" --password-stdin >/dev/null
unset registry_token

cd "$project_dir"
old_tag=$(cat "$tag_file" 2>/dev/null || printf '%s' initial-local)

wait_for_services() {
  for attempt in $(seq 1 45); do
    if docker compose exec -T api node -e \
      "fetch('http://127.0.0.1:4000/health').then(response => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))" \
      && docker compose exec -T web wget -qO- http://127.0.0.1/ >/dev/null; then
      return 0
    fi
    sleep 2
  done
  return 1
}

export ANITABIA_IMAGE_TAG="$new_tag"
docker compose pull --policy always api web
docker compose up -d --no-deps api web

if ! wait_for_services; then
  echo "Deployment health check failed; rolling back to $old_tag" >&2
  export ANITABIA_IMAGE_TAG="$old_tag"
  docker compose up -d --no-deps api web
  wait_for_services || true
  exit 1
fi

printf '%s\n' "$new_tag" > "$tag_file"
docker compose ps api web
