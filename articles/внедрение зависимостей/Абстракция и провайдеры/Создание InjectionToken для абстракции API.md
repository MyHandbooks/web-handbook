---
tags: [angular, внедрение-зависимостей, архитектура]
related: ["[[Создание глобального синглтона (providedIn root).md]]", "[[Конфигурация подмены провайдеров (app.config).md]]"]
status: "completed"
---

# Создание InjectionToken для абстракции API

## БЫСТРЫЙ СТАРТ

*   **`InjectionToken`** — это специальный класс Angular, используемый для создания уникальных физических ключей (токенов) внедрения зависимостей, когда в качестве зависимости выступают интерфейсы, примитивы, конфигурационные объекты или системные API.
*   **Проблема стирания типов (Type Erasure):** Интерфейсы TypeScript полностью удаляются при компиляции в JavaScript. Из-за этого вы не можете написать `inject(MyInterface)` — в рантайме этого интерфейса не существует. InjectionToken решает эту проблему, выступая осязаемым рантайм-представителем интерфейса.
*   **Используйте его для:**
    *   Реализации принципа инверсии зависимостей (Dependency Inversion), связывая TypeScript-интерфейсы с конкретными классами-реализациями.
    *   Безопасного обертывания глобальных браузерных API (таких как `window`, `localStorage`, `document`) для обеспечения совместимости с сервером (SSR/SSG).
    *   Внедрения конфигурационных объектов (констант, переменных окружения).
*   **Не используйте его:** для обычных классов-сервисов. Сам класс в JavaScript является функцией-конструктором (физическим объектом в рантайме), поэтому компилятор Angular может использовать имя класса как готовый токен без дополнительных абстракций.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: InjectionToken для сопряжения интерфейса (Dependency Inversion)
*   **Назначение:** Создание абстрактного контракта (интерфейса) взаимодействия с сервером и привязка его к токену для возможности динамической подмены реализации.

#### 1. Файл токена и интерфейса: `data-service.token.ts`
```typescript
import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

// Описываем чистый TypeScript-интерфейс (контракт)
export interface DataService {
  fetchRecords(): Observable<string[]>;
}

// Создаем уникальный InjectionToken, типизированный интерфейсом.
// Строковый дескриптор в конструкторе нужен исключительно для удобства отладки в логах
export const DATA_SERVICE_TOKEN = new InjectionToken<DataService>('DATA_SERVICE_TOKEN');
```

#### 2. Файл логики: `data-list.ts`
```typescript
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DATA_SERVICE_TOKEN } from './data-service.token';

@Component({
  selector: 'app-data-list',
  // Шаблон вынесен во внешний HTML-файл
  templateUrl: './data-list.html',
  // Стили вынесены во внешний CSS-файл
  styleUrl: './data-list.css',
  // OnPush оптимизирует CD-циклы при получении реактивных данных
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataList {
  // Внедряем службу по её токену. 
  // Нам не важно, какая именно реализация будет подставлена в app.config (Mock или Http)
  protected readonly dataService = inject(DATA_SERVICE_TOKEN);
}
```

#### 3. Файл разметки: `data-list.html`
```html
<div class="list-container">
  <p>Реактивный список данных инициализирован</p>
</div>
```

#### 4. Файл стилей: `data-list.css`
```css
.list-container {
  padding: 16px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
}
```

---

### Шаблон 2: Обертывание браузерного `localStorage` для SSR-совместимости
*   **Назначение:** Безопасное внедрение глобального хранилища `localStorage` с проверкой платформы, исключающее падение приложения при серверном рендеринге (SSR).

#### 1. Файл токена: `local-storage.token.ts`
```typescript
import { InjectionToken, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// Создаем токен для localStorage с фабрикой по умолчанию
export const LOCAL_STORAGE_TOKEN = new InjectionToken<Storage>('LOCAL_STORAGE_TOKEN', {
  providedIn: 'root', // Токен будет глобальным синглтоном
  factory: () => {
    // Внедряем PLATFORM_ID для определения среды выполнения (браузер или Node.js)
    const platformId = inject(PLATFORM_ID);

    // Если мы выполняемся в браузере — возвращаем реальный window.localStorage
    if (isPlatformBrowser(platformId)) {
      return window.localStorage;
    }

    // Если на сервере (Node.js) — возвращаем mock-заглушку, чтобы код не падал с ошибкой "window is not defined"
    return {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {}
    } as unknown as Storage;
  }
});
```

#### 2. Файл логики: `user-settings.ts`
```typescript
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { LOCAL_STORAGE_TOKEN } from './local-storage.token';

@Component({
  selector: 'app-user-settings',
  templateUrl: './user-settings.html',
  styleUrl: './user-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserSettings {
  // Внедряем localStorage без прямого обращения к глобальной переменной window
  private readonly storage = inject(LOCAL_STORAGE_TOKEN);

  protected saveTheme(theme: string): void {
    this.storage.setItem('app-theme', theme);
  }
}
```

#### 3. Файл разметки: `user-settings.html`
```html
<div class="settings-box">
  <button (click)="saveTheme('dark-theme')">Сохранить темную тему</button>
</div>
```

#### 4. Файл стилей: `user-settings.css`
```css
.settings-box {
  display: flex;
  gap: 8px;
}
```

---

### Шаблон 3: Токен конфигурации с дефолтной фабрикой
*   **Назначение:** Описание токена конфигурации, который автоматически предоставляет дефолтные настройки, если в приложении не был предоставлен кастомный конфиг.

#### 1. Файл токена: `app-feature-config.ts`
```typescript
import { InjectionToken } from '@angular/core';

export interface AppFeatureConfig {
  enableSso: boolean;
  maxUploadSizeMb: number;
}

// Создаем токен со встроенной фабричной инициализацией по умолчанию
export const APP_FEATURE_CONFIG = new InjectionToken<AppFeatureConfig>('APP_FEATURE_CONFIG', {
  providedIn: 'root', // Глобальная область видимости
  factory: () => ({
    // Дефолтные настройки, которые будут применены "из коробки"
    enableSso: false,
    maxUploadSizeMb: 10
  })
});
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Проблема стирания типов (Type Erasure) и физика токенов
Когда TypeScript компилирует файлы в JavaScript, происходит процесс очистки типов (Type Erasure). Все интерфейсы полностью исчезают из финального кода.
Разсмотрим разницу:
*   **Класс:** `class MyClass {}` компилируется в JavaScript-функцию `function MyClass() {}`. Это физический объект в памяти, на который можно сослаться в рантайме.
*   **Интерфейс:** `interface MyInterface {}` компилируется в абсолютно пустую строку. Ссылаться на него в JS-коде невозможно.

Поскольку DI-контейнер Angular работает во время выполнения приложения (в рантайме), ему необходим осязаемый JavaScript-объект в качестве ключа поиска в реестре зависимостей. `InjectionToken` как раз и является таким физическим объектом. Объявляя `const TOKEN = new InjectionToken('desc')`, мы создаем уникальный экземпляр класса в оперативной памяти JS, который гарантированно не сотрется и послужит надежным ключом для поиска нужной службы.

### 2. Абстракция платформы и подготовка к SSR (Server-Side Rendering)
В современном веб-разработке Angular-приложения часто рендерятся на стороне сервера (Server-Side Rendering / SSR) под управлением Node.js для ускорения первой отрисовки и улучшения SEO. 

В среде Node.js отсутствуют браузерные объекты `window`, `document`, `navigator` и `localStorage`. Если вы напишете в коде сервиса прямое обращение вида `localStorage.getItem('token')`, то при запуске на сервере приложение моментально упадет с критической ошибкой `ReferenceError: localStorage is not defined`.

Использование `InjectionToken` с фабрикой, использующей проверку `isPlatformBrowser(platformId)`, элегантно решает эту проблему. Компоненты взаимодействуют со стандартным интерфейсом `Storage`, не зная о том, что на сервере им подменили реальный браузерный API на безопасный пустой mock-объект. Это делает код кроссплатформенным и устойчивым к сбоям.

### 3. Детальный пошаговый разбор механизма работы `InjectionToken` с фабричным провайдером
Разберем, что происходит, когда компонент запрашивает `inject(LOCAL_STORAGE_TOKEN)`:
1.  **Поиск в инжекторе:** Angular ищет токен `LOCAL_STORAGE_TOKEN` во внутреннем реестре.
2.  **Триггер фабрики:** При первом обращении экземпляр еще не создан. Angular видит, что в конфигурации токена объявлено свойство `factory`.
3.  **Внедрение зависимостей внутри фабрики:** Фабрика вызывает `inject(PLATFORM_ID)`. Обратите внимание: фабрика выполняется в контексте внедрения, поэтому вызов `inject()` внутри нее полностью легален.
4.  **Разветвление логики:**
    *   *В браузере:* Фабрика возвращает `window.localStorage`.
    *   *На сервере:* Фабрика возвращает mock-объект.
5.  **Кеширование:** Полученное значение сохраняется в реестре инжектора. Все последующие вызовы `inject(LOCAL_STORAGE_TOKEN)` будут возвращать это сохраненное значение мгновенно без повторного выполнения кода фабрики.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Ошибка NullInjectorError при попытке инжектить интерфейс напрямую**
    *   *Проблема:* Разработчик пытается запросить зависимость, указывая интерфейс: `private api = inject(DataService)`. Код падает с ошибкой, так как `DataService` стирается при компиляции.
    *   *Решение:* Объявите `InjectionToken` и запрашивайте зависимость по этому токену через `inject(DATA_SERVICE_TOKEN)`.

```typescript
// ПЛОХО (Попытка использовать интерфейс как токен вызовет ошибку компиляции)
// const service = inject(DataService); // ! Ошибка: 'DataService' only refers to a type, but is being used as a value here.

// ХОРОШО (Использование InjectionToken)
@Component({
  selector: 'app-fixed-data',
  templateUrl: './fixed-data.html',
  styleUrl: './fixed-data.css'
})
export class FixedData {
  // Использование физического токена гарантирует успешное внедрение
  protected readonly service = inject(DATA_SERVICE_TOKEN);
}
```

*   **Ошибка 2: Использование строковых токенов (String Tokens) и коллизии имен**
    *   *Проблема:* В старом коде часто можно встретить регистрацию зависимостей по обычной строке: `{ provide: 'API_URL', useValue: 'https://api.com' }`. Если сторонняя подключаемая библиотека или другая команда в проекте также зарегистрирует зависимость под строковым ключом `'API_URL'`, произойдет неявная перезапись (коллизия), и приложение начнет работать некорректно.
    *   *Решение:* Всегда используйте `InjectionToken` вместо сырых строк. Каждый экземпляр `InjectionToken` уникален на уровне ссылок в памяти JavaScript, что полностью исключает коллизии имен даже при совпадении строковых описаний.

*   **Ошибка 3: Обращение к браузерным API на сервере через фабрики без проверки платформы**
    *   *Проблема:* Разработчик оборачивает `window.location` в InjectionToken, но забывает сделать проверку `isPlatformBrowser` внутри фабрики. В результате на этапе SSR приложение падает с ошибкой инициализации.
    *   *Решение:* При написании фабрик для любых глобальных браузерных объектов всегда предусматривайте безопасный fallback-сценарий (генерацию заглушки или возврат `null`) для серверного окружения.