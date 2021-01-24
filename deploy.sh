#!/bin/bash

set -e
set -x

mkdir -p deploy

ID=$(
    curl \
        --header "Accept: application/vnd.github.v3+json" \
        -u "autarch:$GITHUB_TOKEN" \
        https://api.github.com/repos/houseabsolute/local-covid-tracker/actions/artifacts | \
        jq '.artifacts[0].id' \
)

URL=$(
curl \
    --head \
    -u "autarch:$GITHUB_TOKEN" \
    https://api.github.com/repos/houseabsolute/local-covid-tracker/actions/artifacts/$ID/zip | \
    grep -Fi "Location: " | \
    sed "s/[Ll]ocation: /url=/"
)

echo "$URL" | \
    curl -K -  | \
    zcat > ./deploy/summary.json

cp chart.js index.html ./deploy/
