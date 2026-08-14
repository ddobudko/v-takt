# Публикация на itch.io

Всё, что нельзя сделать без аккаунта, вынесено в шаги ниже. Файлы уже готовы.

## Что готово

- `dist/vtakt-itch.zip` — 28 КБ, шесть файлов, `index.html` в корне архива
  (itch запускает именно его).
- `press/cover-630x500.png` — обложка в требуемом размере.
- `press/01-grid.png`, `03-early.png`, `04-tension.png`, `05-grid-en.png`,
  `02-title.png` — скриншоты 1920×1080.

Пересобрать снимки: поднять `python3 -m http.server 8123` в папке игры и
запустить `python3 capture.py`.

## Шаги

1. Завести аккаунт на itch.io, затем **Dashboard → Create new project**.
2. **Kind of project — HTML.** Это включает запуск в браузере.
3. Загрузить `dist/vtakt-itch.zip` и поставить галочку
   **This file will be played in the browser**.
4. **Embed options:** размер окна 1280×720, включить
   **Click to launch in fullscreen** и **Fullscreen button**. Без второй
   галочки клавиша `f` внутри рамки не сработает — браузер не разрешает
   полный экран из iframe, если это не объявлено на самой рамке.
5. **Mobile friendly — выключить.** Игра рассчитана на мышь и клавиатуру,
   тач-ввод не поддержан.
6. Обложка — `press/cover-630x500.png`, скриншоты — остальные файлы из `press/`.
7. Цена: **No payments** или **Donation**. Для прототипа разумнее первое.
8. Visibility — **Public**, затем **Save & view page**.

## Описание

### Русский

**втакт** — ритм-игра без падающих нот.

Мир дышит своим ритмом. Единственное действие — клик: попал в фазу плитки, и
инструмент входит в трек. Но он не играет вечно. Через несколько своих циклов
он замолкает, и с этого момента тянет очки вниз каждую долю.

Инструменты приходят по одному в сетку три на три, от центра наружу. Каждый
следующий стоит дороже предыдущего — и каждый следующий становится ещё одним
обязательством. Вся игра в этой вилке: тянуться за новым и дорогим, не уронив
старое и дешёвое.

Темп — обратная связь, а не настройка. Чистая игра разгоняет его, ошибки
сбрасывают, а взятый инструмент даёт передышку, чтобы освоиться.

Девять голосов, всё синтезируется на лету, ни одного сэмпла. Ритмическая
сетка живёт на часах аудиоконтекста, поэтому не плывёт.

Мышь или клавиши **qwe · asd · zxc** — они повторяют расположение плиток.
Со звуком.

### English

**vtakt** — a rhythm game without falling notes.

The world breathes its own rhythm. The only action is a click: land on a
tile's phase and its instrument joins the track. But it won't play forever.
After a few of its own cycles it falls silent — and from then on it drains
your score every beat.

Instruments arrive one at a time into a three by three grid, from the centre
outward. Each next one is worth more than the last — and each next one becomes
one more obligation. The whole game lives in that fork: reach for the new and
expensive without dropping the old and cheap.

Tempo is feedback, not a setting. Clean play speeds it up, mistakes knock it
back, and taking a new instrument buys you a moment to settle in.

Nine voices, everything synthesised on the fly, not a single sample. The
rhythmic grid runs on the audio clock, so it never drifts.

Mouse, or keys **qwe · asd · zxc** — they mirror the tile layout.
Sound on.

## Теги

`rhythm`, `music`, `minimalist`, `arcade`, `html5`, `singleplayer`,
`score-attack`, `procedural-audio`

Жанр — Rhythm. Ввод — Mouse, Keyboard. Платформа — HTML5.

## Пересборка архива

```
cd ~/v-takt
rm -rf dist && mkdir dist
zip -j dist/vtakt-itch.zip index.html styles.css store.js i18n.js audio.js game.js
```

Флаг `-j` кладёт файлы в корень архива без папки — itch ищет `index.html`
именно там.
