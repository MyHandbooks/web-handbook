---
tags: [angular, rxjs, пайпы, асинхронность]
related: ["[[Кастомный чистый пайп (pure pipe).md]]", "[[Автоматическая отписка в RxJS через takeUntilDestroyed и DestroyRef.md]]"]
status: "completed"
---

# Асинхронное развертывание в HTML (AsyncPipe)

## БЫСТРЫЙ СТАРТ

*   **Класс `AsyncPipe`** — это встроенный инструмент Angular для прямой подписки на асинхронные источники данных (потоки `Observable` или обещания `Promise`) непосредственно в HTML-шаблоне.
*   **Автоматическое управление памятью:** Пайп самостоятельно подписывается на источник при инициализации компонента и — самое важное — гарантированно отписывается от него при уничтожении компонента (`onDestroy`), предотвращая утечки оперативной памяти браузера.
*   **Используйте:** Для вывода данных из реактивных сервисов, работы с HTTP-запросами через HttpClient, отслеживания изменений форм (`valueChanges`) или отображения данных реального времени, не загрязняя класс компонента ручными подписками.
*   **Не используйте:** Для выполнения фоновых побочных эффектов (side-effects), записи логов или отправки мутирующих запросов на сервер, которые не возвращают чистые данные для отображения. Для этих целей подходят обработчики событий в TS-файлах.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Асинхронный вывод потока данных реального времени (StreamDemo)
*   **Назначение:** Компонент подписывается на бесконечный поток обновлений статуса сервера через `AsyncPipe` с гарантией безопасного уничтожения подписки.

#### 1. Файл логики компонента: `stream-demo.ts`
```typescript
import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Observable, interval, map } from 'rxjs';

// Описываем строгую структуру данных статуса
interface StatusPayload {
  lastChecked: Date;
  status: 'active' | 'maintenance' | 'offline';
  responseTime: number;
}

@Component({
  selector: 'app-stream-demo',
  imports: [AsyncPipe], // Импортируем только конкретный асинхронный пайп для Tree-Shaking
  templateUrl: './stream-demo.html',
  styleUrl: './stream-demo.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush идеально работает со стримами через AsyncPipe
})
export class StreamDemo implements OnInit {
  // Объявляем холодный поток, типизированный интерфейсом
  public status$!: Observable<StatusPayload>;

  public ngOnInit(): void {
    // Каждые 3 секунды эмулируем опрос сервера и генерируем новый объект статуса
    this.status$ = interval(3000).pipe(
      map((tick): StatusPayload => ({
        lastChecked: new Date(),
        status: tick % 5 === 0 ? 'maintenance' : 'active',
        responseTime: Math.floor(Math.random() * 150) + 50
      }))
    );
  }
}
```

#### 2. Файл разметки компонента: `stream-demo.html`
```html
<div class="demo-wrapper">
  <h3>Мониторинг инфраструктуры</h3>
  
  <div class="status-card">
    <!-- AsyncPipe автоматически подпишется на поток и обновит UI при появлении новых данных -->
    <p>Последняя проверка: <strong>{{ (status$ | async)?.lastChecked | date:'mediumTime' }}</strong></p>
    <p>Время отклика: <strong>{{ (status$ | async)?.responseTime }} мс</strong></p>
    <p>Статус: <strong>{{ (status$ | async)?.status }}</strong></p>
  </div>
</div>
```

#### 3. Файл стилей компонента: `stream-demo.css`
```css
.demo-wrapper {
  padding: 20px;
}

.status-card {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
```

---

### Шаблон 2: Управляющий поток со связыванием локальной переменной (`@if` + `async`)
*   **Назначение:** Применение синтаксиса `as` в современном управляющем блоке `@if` для безопасного извлечения данных из потока и исключения дублирующих подписок.

#### 1. Файл логики компонента: `auth-view.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Observable, delay, of } from 'rxjs';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

@Component({
  selector: 'app-auth-view',
  imports: [AsyncPipe],
  templateUrl: './auth-view.html',
  styleUrl: './auth-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthView {
  // Эмулируем задержку получения данных профиля пользователя из сети
  public readonly userProfile$: Observable<UserProfile> = of({
    id: 'usr-441',
    name: 'Елизавета',
    email: 'elizabeth@web-archive.org',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg'
  }).pipe(delay(1500));
}
```

#### 2. Файл разметки компонента: `auth-view.html`
```html
<div class="profile-container">
  <!-- 
    Используем современный Control Flow Angular.
    Конструкция "as user" разворачивает Observable один раз и сохраняет данные в локальную переменную "user".
    Блок @else отображает состояние загрузки.
  -->
  @if (userProfile$ | async; as user) {
    <div class="user-card">
      <img [src]="user.avatarUrl" [alt]="user.name" class="avatar" />
      <div class="details">
        <h4>{{ user.name }}</h4>
        <p>{{ user.email }}</p>
        <small>ID: {{ user.id }}</small>
      </div>
    </div>
  } @else {
    <div class="loader">
      <p>Синхронизация профиля с облаком...</p>
    </div>
  }
</div>
```

#### 3. Файл стилей компонента: `auth-view.css`
```css
.profile-container {
  padding: 24px;
}

.user-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid var(--accent);
}

.details h4 {
  margin-bottom: 4px;
  font-size: 1.1rem;
}

.loader {
  color: var(--text-muted);
  font-style: italic;
}
```

---

### Шаблон 3: Паттерн единого состояния представления (Unified View State ViewModel)
*   **Назначение:** Объединение нескольких независимых асинхронных потоков в один общий объект состояния `ViewModel` на уровне TS, разворачиваемый на весь экран с помощью единственного `AsyncPipe`.

#### 1. Файл логики компонента: `dashboard.ts`
```typescript
import { Component, ChangeDetectionStrategy, OnInit } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { Observable, combineLatest, map, of, delay, timer } from 'rxjs';

// Описываем структуру ViewModel для экрана
interface DashboardVm {
  activeProjects: string[];
  unreadMessagesCount: number;
  systemAlerts: string[];
}

@Component({
  selector: 'app-dashboard',
  imports: [AsyncPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Dashboard implements OnInit {
  // Единый реактивный источник правды для всего шаблона
  public vm$!: Observable<DashboardVm>;

  public ngOnInit(): void {
    // 1. Поток списка проектов
    const projects$ = of(['Интеграция CRM', 'Обновление Биллинга', 'Рефакторинг API']).pipe(delay(800));
    
    // 2. Поток счетчика непрочитанных сообщений, обновляющийся раз в 10 секунд
    const unreadCount$ = timer(0, 10000).pipe(map(tick => tick * 2 + 1));
    
    // 3. Поток системных предупреждений
    const alerts$ = of(['Истекает SSL-сертификат', 'Высокая нагрузка на БД']).pipe(delay(1200));

    // Объединяем все потоки с помощью combineLatest
    this.vm$ = combineLatest([projects$, unreadCount$, alerts$]).pipe(
      map(([projects, unreadCount, alerts]): DashboardVm => ({
        activeProjects: projects,
        unreadMessagesCount: unreadCount,
        systemAlerts: alerts
      }))
    );
  }
}
```

#### 2. Файл разметки компонента: `dashboard.html`
```html
<div class="dashboard-wrapper">
  <h2>Панель управления проектами</h2>

  <!-- 
    Один единственный AsyncPipe на весь экран. 
    Гарантирует атомарную отрисовку интерфейса без мерцаний и исключает race conditions.
  -->
  @if (vm$ | async; as vm) {
    <div class="grid">
      <div class="grid-card">
        <h3>Мои проекты ({{ vm.activeProjects.length }})</h3>
        <ul>
          @for (project of vm.activeProjects; track project) {
            <li>{{ project }}</li>
          }
        </ul>
      </div>

      <div class="grid-card alerts">
        <h3>Критические предупреждения</h3>
        <ul>
          @for (alert of vm.systemAlerts; track alert) {
            <li>⚠️ {{ alert }}</li>
          }
        </ul>
      </div>
    </div>

    <footer class="footer">
      <span>Непрочитанных уведомлений: <strong>{{ vm.unreadMessagesCount }}</strong></span>
    </footer>
  } @else {
    <div class="global-spinner">Загрузка данных панели управления...</div>
  }
</div>
```

#### 3. Файл стилей компонента: `dashboard.css`
```css
.dashboard-wrapper {
  padding: 24px;
}

.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 16px;
}

.grid-card {
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.grid-card.alerts {
  background-color: var(--warning-bg);
  border-color: var(--warning-border);
  color: var(--warning-text);
}

.footer {
  margin-top: 24px;
  padding: 12px;
  border-top: 1px solid var(--border);
  text-align: right;
}

.global-spinner {
  text-align: center;
  padding: 40px;
  color: var(--text-muted);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Внутреннее устройство и физика работы AsyncPipe
`AsyncPipe` — это не просто синтаксический сахар, а сложная системная директива-пайп, которая берет на себя управление жизненным циклом потока.

Рассмотрим, что происходит внутри Angular при использовании `stream$ | async`:

1.  **Создание подписки (Subscription):**
    При первом запуске Change Detection в месте вызова пайпа Angular обращается к методу `transform(obj: Observable<T> | Promise<T>)`. Пайп проверяет тип входящего аргумента. Если это Observable, он императивно подписывается на него:
    ```typescript
    this._subscription = obj.subscribe({
      next: (value: T) => this._updateLatestValue(obj, value),
      error: (err: unknown) => { throw err; }
    });
    ```
2.  **Запуск проверки изменений (Change Detection):**
    При поступлении нового значения в поток срабатывает колбэк `_updateLatestValue()`. Пайп сохраняет полученное значение во внутреннюю переменную и вызывает системный метод:
    ```typescript
    this._ref.markForCheck(); // Помечает компонент и его предков как "грязные" (dirty)
    ```
    Благодаря вызову `markForCheck()`, `AsyncPipe` идеально совместим со стратегией рендеринга `ChangeDetectionStrategy.OnPush`. Компонент перерисуется в ту же секунду, когда данные придут из сети, даже если в приложении отключены фоновые триггеры проверки изменений.
3.  **Иммутабельная смена источника:**
    Если в процессе работы ссылка на поток `status$` изменяется (например, заменяется новым вызовом HTTP-метода), `AsyncPipe` автоматически отписывается от старого стрима и инициирует подписку на новый объект.
4.  **Гарантированная отписка:**
    В пайпе реализован хук `ngOnDestroy()`. При уничтожении компонента Angular вызывает деструктор пайпа, который выполняет:
    ```typescript
    this._subscription.unsubscribe();
    ```
    Это полностью исключает утечки ресурсов и предохраняет браузер от фонового переполнения кучи (heap).

### 2. Почему AsyncPipe — это золотой стандарт разработки в Angular
Сравним два подхода к получению и отображению данных:

```typescript
// ПЛОХОЙ ПОДХОД (Ручная подписка внутри TS-кода)
@Component({ ... })
export class ManualDemo implements OnInit, OnDestroy {
  public data: string = '';
  private sub?: Subscription;

  public ngOnInit() {
    this.sub = this.api.getData().subscribe(val => {
      this.data = val; // Ручное сохранение
    });
  }
  public ngOnDestroy() {
    this.sub?.unsubscribe(); // Забыли написать? Получили утечку памяти!
  }
}
```

#### Преимущества AsyncPipe:
*   **Иммунитет к утечкам памяти:** Разработчику физически невозможно забыть написать отписку — она реализована на уровне ядра фреймворка.
*   **Чистота TS-файлов:** Логика компонента становится декларативной. Нет лишних свойств-буферов, хуков `OnDestroy` и громоздкого кода ручного управления подписками.
*   **Максимальный FPS (OnPush):** Компонент рендерится точечно и только при реальном обновлении данных в потоке, избавляя браузер от холостых запусков циклов Change Detection.

---

### 3. Типичные ошибки и их решение

*   **Ошибка 1: Антипаттерн "Множественные асинхронные пайпы" (Multiple Async Pipes)**
    *   *Симптомы:* Многократное дублирование тяжелых HTTP-запросов во вкладке Network при загрузке одной страницы.
    *   *Физика процесса:* Если вы используете один и тот же холодный поток `data$` несколько раз в шаблоне:
        `<h1>{{ (data$ | async)?.title }}</h1> <p>{{ (data$ | async)?.description }}</p>`
        Каждый вызов пайпа `| async` создает *новую независимую физическую подписку* на источник. Если это сетевой запрос, он выполнится столько раз, сколько пайпов объявлено в шаблоне.
    *   *Решение:* 
        1. Используйте оператор `@if (data$ | async; as data)` (как показано в Шаблоне 2) для создания единственной подписки.
        2. При необходимости используйте оператор `shareReplay({ bufferSize: 1, refCount: true })` в цепочке RxJS-потока для преобразования холодного потока в горячий.

*   **Ошибка 2: Создание новых экземпляров Observable внутри геттеров шаблона**
    *   *Симптомы:* Бесконечные циклы вызовов методов, зависание и падение вкладки браузера с ошибкой Out of Memory.
    *   *Физика процесса:* Разработчик применяет пайп к вызову метода или геттеру:
        `<div *ngIf="getDataStream() | async">`
        При проверке изменений Angular считывает значение геттера. Геттер `getDataStream()` возвращает *новый экземпляр* `new Observable()`. Пайп видит изменение ссылки, отписывается, подписывается заново, это вызывает триггер обновления, который запускает Change Detection заново, зацикливая рендеринг.
    *   *Решение:* Инициализируйте потоки строго один раз внутри хука `ngOnInit` или в свойствах класса, привязывая пайп только к стабильным ссылкам.

*   **Ошибка 3: Полная "немота" интерфейса при сбоях (Необработанная ошибка потока)**
    *   *Симптомы:* На экране вечно висит индикатор загрузки, хотя сервер уже ответил ошибкой (например, `500 Internal Server Error`).
    *   *Физика процесса:* RxJS по спецификации полностью разрушает (уничтожает) поток и прекращает вещание при возникновении ошибки. `AsyncPipe` перестает получать данные, и шаблон "замерзает" в состоянии лоадера.
    *   *Решение:* Всегда перехватывайте ошибки в цепочке потока с помощью оператора `catchError`, возвращая безопасный fallback-объект.

```typescript
// ПЛОХО (Ошибка поломает поток, UI навсегда зависнет в состоянии загрузки)
this.data$ = this.api.fetchData();

// ХОРОШО (Перехватываем ошибку, передавая структурированный флаг сбоя в шаблон)
this.data$ = this.api.fetchData().pipe(
  catchError(error => {
    console.error('Ошибка сети:', error);
    return of({ error: true, message: 'Не удалось загрузить данные' });
  })
);
```