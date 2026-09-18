import { lang } from './i18n'

export interface Release {
  version: string

  date: string
  ru: string[]
  en: string[]
}

export const HISTORY: Release[] = [
  {
    version: '0.4.2',
    date: '2026-09-18',
    ru: [
      'Фон из PowerPoint переносится точно: рисует его сам PowerPoint, поэтому остаются волны, градиенты и цвета темы, а не одна заливка.',
      'Цвет текста подстраивается под такой фон: на светлой теме буквы становятся тёмными.',
      'Уведомления гаснут сами: обычные через несколько секунд, сообщения об ошибке — дольше.'
    ],
    en: [
      'The PowerPoint background comes across exactly: PowerPoint itself draws it, so the waves, gradients and theme colours stay instead of a single fill.',
      'The text colour follows that background: on a light theme the letters turn dark.',
      'Notices fade away by themselves: ordinary ones after a few seconds, error messages after longer.'
    ]
  },
  {
    version: '0.4.1',
    date: '2026-09-17',
    ru: [
      'Караоке красит каждую строку своим цветом: на пёстром фоне верхние строки и нижние больше не сливаются.',
      'Цвет караоке выбирается так же, как цвет текста: палитрой с ползунком, полем кода и кнопкой «под фон».',
      'В наборе цветов караоке появились тёмные — для светлых фонов и фотографий.',
      'История обновлений здесь стала короче.'
    ],
    en: [
      'Karaoke colours every line on its own: on a busy background the top and bottom lines no longer blend in.',
      'The karaoke colour is chosen the same way as the text colour: a palette with a slider, a code field and a “to background” button.',
      'The karaoke colour set now has dark colours too — for light backgrounds and photographs.',
      'This list of changes is shorter now.'
    ]
  },
  {
    version: '0.4.0',
    date: '2026-09-14',
    ru: [
      'Каталог песен: общий сборник общины со своими вкладками, поиском и защитой от повторов.',
      'Умный импорт: одинаковые слайды сами становятся припевом, фон презентации ложится в галерею фонов.',
      'Номер задаёт место песни в библиотеке; порядок меняется и мышью.',
      'Пульт листает то, что на экране, и работает, даже когда программа свёрнута.',
      'На «Главной» — кнопки подключённых мониторов: предпросмотр принимает пропорции выбранного экрана.',
      'Караоке само подбирает цвет закраски под фон.',
      'Презентация, ставшая песней, уходит из плана; песней становится и старый .ppt.'
    ],
    en: [
      'Song catalogue: the church songbook with its own tabs, search and protection from duplicates.',
      'Smarter import: identical slides become the chorus by themselves, and the presentation background goes into the background gallery.',
      'The number sets a song’s place in the library; the order can also be changed with the mouse.',
      'The remote steps what is on screen and works even when the app is minimised.',
      'Buttons for the connected monitors on the Home tab: the preview takes the shape of the chosen screen.',
      'Karaoke chooses its fill colour for the background by itself.',
      'A presentation turned into a song leaves the plan; an old .ppt can become a song too.'
    ]
  },
  {
    version: '0.3.0',
    date: '2026-09-07',
    ru: [
      'Пульт проповедника: программа слушает кнопки презентера.',
      'Показ можно сделать песней — с текстом по частям и фоном презентации.',
      'Книги Библии стоят в одном порядке во всех переводах, неканонические — отдельным списком.',
      'Караоке закрашивает слово по букве, а не заливает целиком.',
      'Поля ввода растут под текст: список нужд виден целиком.'
    ],
    en: [
      'Presenter remote: the program listens to the buttons of a presenter.',
      'A show can become a song — with the words split into parts and the background kept.',
      'The books of the Bible stand in one order in every translation; the non-canonical ones have a list of their own.',
      'Karaoke fills a word letter by letter instead of washing it with colour.',
      'Text fields grow with what is in them: the whole list of needs is visible.'
    ]
  },
  {
    version: '0.2.4',
    date: '2026-08-31',
    ru: [
      'Ctrl+Z отменяет последнее действие по всей программе, Ctrl+Shift+Z возвращает.',
      'Караоке идёт за пением само: программа слушает зал и узнаёт слова этой песни.',
      'Для слуха один раз ставится голосовой модуль — кнопкой или с флешки.'
    ],
    en: [
      'Ctrl+Z undoes the last action anywhere in the program, Ctrl+Shift+Z brings it back.',
      'Karaoke follows the singing by itself: the program listens to the hall and recognises the words of the song.',
      'A voice module is installed once — by a button or from a flash drive.'
    ]
  },
  {
    version: '0.2.3',
    date: '2026-08-31',
    ru: [
      'Текст занимает весь экран, а размер выбирается привычными числами, как в Word.',
      'Текст режется на слайды под тот экран, который стоит в зале.',
      'Презентации больше не искажаются: кадр берётся из самой презентации.',
      'Песни из PowerPoint приходят куплетами; читается и старый .ppt.'
    ],
    en: [
      'Text fills the whole screen, and its size is chosen in familiar numbers, like in Word.',
      'Text is split into slides for the screen actually standing in the hall.',
      'Presentations are no longer distorted: the frame comes from the presentation itself.',
      'Songs from PowerPoint arrive as verses; the old .ppt is read as well.'
    ]
  },
  {
    version: '0.2.2',
    date: '2026-08-29',
    ru: [
      'Обновление доводится до конца: установщик переживает закрытие программы.',
      'Тексты выгружаются в файл — текстом, в PDF или в PowerPoint.',
      'Свой формат перевода: один файл .vlb вместо папки с сотней файлов.'
    ],
    en: [
      'Updating finishes the job: the installer outlives the program.',
      'Texts can be exported to a file — as plain text, PDF or PowerPoint.',
      'Our own translation format: a single .vlb file instead of a folder with a hundred files.'
    ]
  },
  {
    version: '0.2.1',
    date: '2026-08-28',
    ru: [
      'Обновление одной кнопкой: программа скачает новую версию и поставит её сама.',
      'Модули с сайта читаются и у тех, у кого включён VPN или прокси.'
    ],
    en: [
      'Updating with one button: the program downloads the new version and installs it itself.',
      'Modules from the site load for people behind a VPN or proxy too.'
    ]
  },
  {
    version: '0.2.0',
    date: '2026-08-27',
    ru: [
      'Фотографии в служении: снимки с компьютера встают в план одним показом.',
      'Папку можно добавить целиком — каждая презентация в ней станет своим пунктом.',
      'Большие снимки ужимаются до кадра проектора.'
    ],
    en: [
      'Photos in the service: pictures from the computer become one show in the plan.',
      'A whole folder can be added — every presentation inside becomes its own item.',
      'Large pictures are shrunk to the projector frame.'
    ]
  },
  {
    version: '0.1.0',
    date: '2026-08-26',
    ru: [
      'Первая рабочая версия.',
      'Библия, песни, объявления и чужие презентации — на проектор.',
      'Служение одним списком и кнопкой «Далее».',
      'Экраны: зал, сцена и трансляция, каждый на своём мониторе.',
      'Русский и английский язык, тринадцать стилей оформления.'
    ],
    en: [
      'First working version.',
      'Bible, songs, announcements and presentations made elsewhere — on the projector.',
      'The service as one list and a single “Next” button.',
      'Screens: hall, stage and stream, each on its own monitor.',
      'Russian and English, thirteen interface styles.'
    ]
  }
]

export const releaseNotes = (release: Release): string[] =>
  lang() === 'en' ? release.en : release.ru

export function releaseDate(release: Release): string {
  const [year, month, day] = release.date.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(lang(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}
