# GitHub Activity in Readme

Updates `README.md` with the recent GitHub activity of a user.

<img width="735" alt="profile-repo" src="https://user-images.githubusercontent.com/25279263/87703301-3aa4a500-c7b8-11ea-8eb6-245121997a7b.png">

---

## Instructions

- Add the comment `<!--START_SECTION:activity-->` (entry point) within `README.md`.

- It's the time to create a workflow file.

`.github/workflows/update-readme.yml`

```yml
name: Update README

on:
  schedule:
    - cron: '*/30 * * * *'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    name: Update this repo's README with recent activity

    steps:
      - uses: actions/checkout@v2
      - uses: igorkowalczykbot/github-activity@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```


_Inspired by [JasonEtco/activity-box](https://github.com/JasonEtco/activity-box)_

