---
tags: [angular, роутинг, lazy-loading]
related: ["[[Автоматическое связывание параметров маршрута.md]]", "[[Функциональный гард доступа (CanActivate).md]]"]
status: "completed"
---

# Декларативная конфигурация роутера (Lazy Loading)

## БЫСТРЫЙ СТАРТ

*   **Ленивая загрузка (Lazy Loading)** — это архитектурный паттерн оптимизации производительности, при котором монолитный бандл приложения разделяется сборщиком (Vite, Webpack, Rollup) на изолированные асинхронные JS-файлы (чанки). Эти файлы загружаются браузером по сети только в тот момент, когда пользователь физически переходит на соответствующий URL-адрес.
*   **Свойство `loadComponent`** используется для асинхронной загрузки одиночного Standalone-компонента по требованию с помощью динамического ES-импорта `import()`.
*   **Свойство `loadChildren`** применяется для асинхронной загрузки дочерней группы маршрутов (подсистем приложения), сгруппированных в отдельном конфигурационном файле.
*   **Используйте:** Для всех крупных функциональных разделов приложения (личный кабинет, админ-панель, настройки, отчеты), чтобы минимизировать размер стартового чанка (`main.js`) и ускорить первичный рендеринг страницы (FCP).
*   **Не используйте:** Для критически важных стартовых экранов (например, страницы авторизации или домашней страницы), к которым пользователь обращается в первую очередь при переходе на сайт.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Базовая конфигурация роутера с ленивой загрузкой компонентов (app.routes.ts)
*   **Назначение:** Файл описывает глобальные маршруты приложения, используя `loadComponent` для подкачки отдельных экранов и `loadChildren` для загрузки дочерних систем.

#### 1. Файл маршрутов приложения: `app.routes.ts`
```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'dashboard',
    // Лениво загружаем один компонент. Сборщик создаст для него отдельный JS-чанк.
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard)
  },
  {
    path: 'management',
    // Лениво загружаем целую группу дочерних роутов административной панели
    loadChildren: () => import('./features/admin/admin.routes').then(m => m.adminRoutes)
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full' // Строгое соответствие пустому пути для редиректа
  },
  {
    path: '**', // Маршрут-fallback для обработки несуществующих URL
    loadComponent: () => import('./features/not-found/not-found').then(m => m.NotFound)
  }
];
```

#### 2. Файл логики ленивого компонента: `dashboard.ts`
```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Dashboard { }
```

#### 3. Файл разметки ленивого компонента: `dashboard.html`
```html
<div class="dashboard-container">
  <h2>Главная панель управления</h2>
  <p>Этот экран был загружен лениво только при переходе на адрес /dashboard.</p>
</div>
```

#### 4. Файл стилей ленивого компонента: `dashboard.css`
```css
.dashboard-container {
  padding: 24px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
}
```

---

### Шаблон 2: Ленивая загрузка дочерней группы маршрутов (admin.routes.ts)
*   **Назначение:** Описание вложенного дерева маршрутов административной панели, загружаемого единым асинхронным пакетом.

#### 1. Файл дочерних маршрутов: `admin.routes.ts`
```typescript
import { Routes } from '@angular/router';

// Экспортируем константу с дочерними маршрутами
export const adminRoutes: Routes = [
  {
    path: '',
    // Загружаем общий макет (Layout), который содержит <router-outlet> для вложенных экранов
    loadComponent: () => import('./admin-layout').then(m => m.AdminLayout),
    children: [
      {
        path: 'users',
        // Вложенный экран управления пользователями
        loadComponent: () => import('./admin-users').then(m => m.AdminUsers)
      },
      {
        path: 'settings',
        // Вложенный экран настроек администрирования
        loadComponent: () => import('./admin-settings').then(m => m.AdminSettings)
      }
    ]
  }
];
```

#### 2. Файл логики макета админ-панели: `admin-layout.ts`
```typescript
import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin-layout',
  // Импортируем утилиты роутинга для навигации внутри макета
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminLayout { }
```

#### 3. Файл разметки макета админ-панели: `admin-layout.html`
```html
<div class="admin-wrapper">
  <aside class="admin-sidebar">
    <!-- Ссылки для перехода по ленивым вложенным маршрутам -->
    <a routerLink="users" routerLinkActive="active-tab">Пользователи</a>
    <a routerLink="settings" routerLinkActive="active-tab">Настройки</a>
  </aside>

  <main class="admin-content">
    <!-- Сюда будут проецироваться ленивые вложенные компоненты (AdminUsers, AdminSettings) -->
    <router-outlet></router-outlet>
  </main>
</div>
```

#### 4. Файл стилей макета админ-панели: `admin-layout.css`
```css
.admin-wrapper {
  display: flex;
  height: 100vh;
}

.admin-sidebar {
  width: 240px;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  padding: 20px;
  gap: 8px;
}

.admin-sidebar a {
  padding: 10px 14px;
  color: var(--text-normal);
  text-decoration: none;
  border-radius: 6px;
  font-size: 0.9rem;
}

.admin-sidebar a.active-tab {
  background-color: var(--nav-active);
  color: var(--accent);
  font-weight: 600;
}

.admin-content {
  flex: 1;
  padding: 30px;
  overflow-y: auto;
}
```

---

### Шаблон 3: Глобальная конфигурация роутера с предзагрузкой (app.config.ts)
*   **Назначение:** Регистрация провайдера маршрутизации в системном конфигурационном файле приложения с активацией фоновой предзагрузки ленивых чанков для мгновенного отклика интерфейса при кликах.

#### 1. Системный конфигурационный файл: `app.config.ts`
```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withPreloading, PreloadAllModules, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Инициализируем глобальный роутер
    provideRouter(
      routes,
      // Включаем фоновую предзагрузку всех ленивых чанков после полной инициализации приложения
      withPreloading(PreloadAllModules),
      // Автоматически связываем параметры URL (path/query) с @Input-сигналами компонентов
      withComponentInputBinding()
    )
  ]
};
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Физика сборки и разделения бандла при ленивой загрузке
Когда вы пишете конструкцию `loadComponent: () => import('./file')`, компилятор Angular и сборщик (Vite или Webpack) обрабатывают этот синтаксис как границу разделения кода (Code Splitting boundary):

1.  **Анализ зависимостей:** Сборщик строит граф зависимостей приложения. Всё, что импортируется напрямую через статический `import { ... } from ...` в заголовке файлов, включается в основной бандл (`main.js`).
2.  **Выделение чанка:** Динамический импорт `import()` сообщает сборщику, что этот файл и его уникальные зависимости (которые не используются в основном бандле) нужно упаковать в отдельный физический JS-файл (например, `chunk-XYZ123.js`).
3.  **Ленивое выполнение:** В момент старта приложения в браузере скачивается только базовый бандл. Браузер выполняет стартовую разметку и инициализацию фреймворка, не тратя время на парсинг и компиляцию кода ленивых модулей.

### 2. Разница между loadComponent и loadChildren на архитектурном уровне
Оба метода реализуют ленивую загрузку, но служат разным архитектурным целям:

*   **`loadComponent` (Ленивый лист дерева):**
    Загружает конкретный файл одного Standalone-компонента. Подходит для простых изолированных страниц. Если у вас на проекте сотни страниц, и каждая грузится через `loadComponent`, сборщик сгенерирует сотни мелких JS-файлов, что может замедлить сборку.
*   **`loadChildren` (Ленивая ветвь дерева):**
    Загружает файл со списком дочерних маршрутов. Этот метод позволяет группировать логически связанные компоненты (например, всю админку) в один общий ленивый бандл. Это упрощает масштабирование проекта и предотвращает избыточное дробление чанков (Chunk Fragmentation).

### 3. Детальный пошаговый разбор процесса активации ленивого роута
Проследим шаги Angular, когда пользователь кликает по ссылке `<a routerLink="/management/users">`:

1.  **Перехват навигации:** Маршрутизатор Angular блокирует стандартную перезагрузку страницы браузера и сопоставляет путь `/management/users` с конфигурацией маршрутов.
2.  **Обнаружение ленивого узла:** Роутер видит, что путь `/management` сопоставлен с `loadChildren: () => import(...)`.
3.  **Асинхронный запрос чанка:** Роутер выполняет динамическую функцию импорта. Нативный загрузчик браузера делает сетевой HTTP-запрос за файлом `admin.routes.js`. В интерфейсе в этот момент может отображаться шкала прогресса загрузки.
4.  **Регистрация конфигурации:** После скачивания файла роутер извлекает массив `adminRoutes`, парсит его и динамически встраивает в дерево активных маршрутов приложения.
5.  **Загрузка компонента:** Роутер видит вложенный роут `users`, сопоставленный с `loadComponent`, запрашивает по сети чанк компонента `AdminUsers` и инстанцирует его внутри `<router-outlet>` макета `AdminLayout`.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Нарушение изоляции чанка из-за статических импортов (Блокировка Lazy Loading)**
    *   *Симптомы:* Сборщик генерирует отдельные файлы чанков, но их физический размер равен нулю, либо при анализе бандла выясняется, что весь ленивый код попал в `main.js`.
    *   *Физика процесса:* Разработчик объявил роут ленивым через `loadComponent`, но случайно оставил статический импорт этого же компонента в шапке файла `app.routes.ts` или импортировал его напрямую в массив `imports` главного не-ленивого компонента. Статический импорт имеет наивысший приоритет, поэтому сборщик вынужден включить файл в основной бандл, полностью ломая ленивую загрузку.
    *   *Решение:* Строго следите за тем, чтобы ленивые компоненты импортировались в файлы конфигурации роутов *только* внутри функции динамического `import()`.

```typescript
// ПЛОХО (Ленивая загрузка заблокирована статическим импортом вверху)
import { Dashboard } from './features/dashboard/dashboard'; 

export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => Dashboard) // Ссылка на статический класс
  }
];

// ХОРОШО (Полная изоляция импорта)
export const routes: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard)
  }
];
```

*   **Ошибка 2: Ошибки ChunkLoadError при потере интернет-соединения пользователем**
    *   *Симптомы:* Белый экран или отсутствие реакции интерфейса при клике на пункт меню у пользователей мобильного интернета в зонах нестабильного приема. В консоли браузера пишется критическая ошибка `Failed to fetch dynamically imported module`.
    *   *Физика процесса:* Браузер пытается скачать ленивый JS-файл с сервера, но сетевой запрос падает по таймауту или из-за обрыва связи. Angular не может разрешить импорт и прерывает навигацию, оставляя пользователя на зависшем экране.
    *   *Решение:* Реализуйте глобальный перехватчик событий маршрутизатора для отслеживания ошибок загрузки и вывода предупреждающего баннера с предложением перезагрузить страницу.

```typescript
import { Injectable, inject, DestroyRef } from '@angular/core';
import { Router, NavigationError } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Injectable({ providedIn: 'root' })
export class RouteErrorTracker {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  public init(): void {
    this.router.events.pipe(
      filter((event): event is NavigationError => event instanceof NavigationError),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(event => {
      if (event.error?.name === 'ChunkLoadError' || event.error?.message?.includes('Failed to fetch')) {
        alert('Ошибка загрузки компонента. Проверьте подключение к сети и обновите страницу.');
        // Опционально: автоматически перезагружаем страницу для попытки повторного скачивания чанка
        // window.location.reload();
      }
    });
  }
}
```

*   **Ошибка 3: Избыточное дублирование сервисов в ленивых модулях (DI Pollution)**
    *   *Симптомы:* В лениво загруженной админке синглтон-сервис инициализируется заново, из-за чего теряются накопленные данные состояния пользователя.
    *   *Физика процесса:* Разработчик объявил сервис в ленивом компоненте через свойство `providers: [MyService]`. Каждый раз, когда ленивый роут загружается и инициализируется, Angular создает локальный дочерний инжектор и порождает новый экземпляр `MyService`, изолируя его от глобального дерева зависимостей.
    *   *Решение:* Для глобальных синглтон-сервисов всегда используйте декоратор `@Injectable({ providedIn: 'root' })` и никогда не регистрируйте их в массиве `providers` лениво загружаемых компонентов. Пользуйтесь массивом `providers` компонентов только тогда, когда вам действительно нужен изолированный экземпляр службы для конкретного экрана.