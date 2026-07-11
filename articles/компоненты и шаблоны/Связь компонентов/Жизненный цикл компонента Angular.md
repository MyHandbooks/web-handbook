---
tags: [angular, компоненты-и-шаблоны, связь-компонентов]
related: ["[[Взаимодействие компонентов в Angular]]", "[[Механизм Change Detection и Zone.js]]"]
status: "completed"
---

# Жизненный цикл компонента Angular

## БЫСТРЫЙ СТАРТ

*   **Жизненный цикл компонента** — это строго регламентированная последовательность фаз от момента инстанцирования класса до его удаления из структуры DOM-дерева, управляемая рантайм-планировщиком Angular.
*   **Хуки жизненного цикла** — встроенные интерфейсы обратного вызова, позволяющие интегрировать кастомную логику на разных этапах: инициализация свойств (`ngOnInit`), проверка изменений (`ngDoCheck`), готовность представления (`ngAfterViewInit`) и уничтожение (`ngOnDestroy`).
*   **Современная SSR-безопасность** — начиная с Angular 17-19+, для манипуляций с DOM и сторонними JS-библиотеками в браузере внедрены специализированные функции `afterNextRender()` и `afterRender()`, а для уничтожения ресурсов — функциональный `DestroyRef`.
*   **Используйте для:** безопасной инициализации данных, интеграции с внешними браузерными API, оптимизации рендеринга и гарантированного высвобождения ресурсов во избежание утечек памяти.
*   **Не используйте для:** выполнения тяжелых расчетов и ручного отслеживания изменений в рамках хука `ngDoCheck()` (это спровоцирует критическое падение производительности).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Скелетный UI-каркас с мультислотовой проекцией контента
*   **Назначение:** Описание гибкого standalone-компонента карточки, использующего селективное распределение внешнего HTML-контента с помощью тегов `<ng-content>`.

#### 1. Файл логики: `card.ts`
```typescript
// Импортируем базовый декоратор и стратегию рендеринга
import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-card',
  // standalone: true опущен, так как в Angular 19+ standalone активен по умолчанию
  templateUrl: './card.html',
  styleUrl: './card.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush для максимальной производительности
})
export class Card {
  // Компонент не содержит тяжелой бизнес-логики, выступая в роли презентационного каркаса
}
```

#### 2. Файл разметки: `card.html`
```html
<article class="custom-card">
  <header class="card-header">
    <!-- Сюда спроецируется только тот HTML-элемент, который содержит атрибут card-header -->
    <ng-content select="[card-header]"></ng-content>
  </header>
  
  <main class="card-body">
    <!-- Слот по умолчанию: сюда попадет весь остальной контент, переданный родителем -->
    <ng-content></ng-content>
  </main>
</article>
```

#### 3. Файл стилей: `card.css`
```css
/* Основной контейнер кастомной карточки */
.custom-card {
  border: 1px solid var(--border);
  background-color: var(--bg-secondary);
  border-radius: 8px;
  overflow: hidden;
}

/* Стилизация спроецированного заголовка */
.card-header {
  padding: 12px 16px;
  background-color: var(--bg-primary);
  border-bottom: 1px solid var(--border);
}

/* Стилизация основного текстового блока */
.card-body {
  padding: 16px;
  color: var(--text-normal);
}
```

---

### Шаблон 2: Компонент профиля со строгой инициализацией, SSR-безопасным рендером и DestroyRef
*   **Назначение:** Описание компонента, демонстрирующего правильный запуск асинхронных операций, работу с канвасом строго в браузере с помощью `afterNextRender` и функциональную очистку через `DestroyRef`.

#### 1. Файл логики: `profile.ts`
```typescript
import { 
  Component, 
  OnInit, 
  ElementRef, 
  viewChild, 
  inject, 
  DestroyRef, 
  ChangeDetectionStrategy, 
  afterNextRender, 
  signal 
} from '@angular/core';
import { interval } from 'rxjs';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.html',
  styleUrl: './profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Profile implements OnInit {
  // Внедряем DestroyRef для программной регистрации колбэков уничтожения ресурсов
  private readonly destroyRef = inject(DestroyRef);

  // Реактивный сигнал для вывода времени активности пользователя
  readonly sessionTime = signal<number>(0);

  // Получаем ссылку на элемент канваса из шаблона в виде сигнала
  readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('chartCanvas');

  constructor() {
    // Безопасная браузерная инициализация. afterNextRender гарантирует, что колбэк
    // выполнится только на клиенте после завершения первой отрисовки (безопасно для SSR).
    afterNextRender(() => {
      const canvas = this.canvasRef()?.nativeElement;
      if (canvas) {
        this.initCanvasChart(canvas);
      }
    });

    // Регистрируем колбэк очистки на уровне контекста внедрения
    this.destroyRef.onDestroy(() => {
      console.log('[LIFECYCLE] Компонент уничтожен, ресурсы освобождены.');
    });
  }

  ngOnInit(): void {
    // Инициируем реактивный интервал для симуляции времени сессии
    const timerSub = interval(1000).subscribe((value: number) => {
      this.sessionTime.set(value);
    });

    // Регистрируем отписку от таймера в DestroyRef для предотвращения утечки памяти
    this.destroyRef.onDestroy(() => {
      timerSub.unsubscribe();
    });
  }

  private initCanvasChart(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Имитируем отрисовку графика. Этот код никогда не запустится на сервере при SSR.
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(10, 10, 150, 80);
    }
  }
}
```

#### 2. Файл разметки: `profile.html`
```html
<div class="profile-container">
  <div class="session-info">
    <p>Время текущей сессии: <strong>{{ sessionTime() }} сек.</strong></p>
  </div>

  <div class="chart-box">
    <!-- Локальный шаблонный идентификатор #chartCanvas для viewChild -->
    <canvas #chartCanvas width="200" height="100" class="profile-canvas"></canvas>
  </div>
</div>
```

#### 3. Файл стилей: `profile.css`
```css
.profile-container {
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.session-info {
  margin-bottom: 16px;
  color: var(--text-normal);
}

.chart-box {
  background-color: var(--bg-primary);
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  display: inline-block;
}

.profile-canvas {
  border: 1px solid var(--border);
  background-color: #000000;
  border-radius: 4px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Иерархическая хронология выполнения хуков жизненного цикла
При инициализации и последующих циклах проверки изменений Angular последовательно вызывает строго определенные методы класса.

```text
    [ Создание экземпляра класса (constructor) ]
                        │
                        ▼
         [ ngOnChanges (при наличии Inputs) ]
                        │
                        ▼
                  [ ngOnInit ]
                        │
                        ▼
                  [ ngDoCheck ]
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
    [ ngAfterContentInit ]   [ ngAfterViewInit ]
            │                       │
            ▼                       ▼
  [ ngAfterContentChecked ] [ ngAfterViewChecked ]
            │                       │
            └───────────┬───────────┘
                        │ (При уничтожении компонента)
                        ▼
                  [ ngOnDestroy / DestroyRef ]
```

*   **`ngOnChanges`**: Срабатывает до `ngOnInit` и вызывается каждый раз, когда меняются входные свойства (`@Input` или сигнальные входы `input()`). Получает объект изменений `SimpleChanges`.
*   **`ngOnInit`**: Запускается один раз после первой инициализации входных свойств. Подходит для декларативной настройки стейта и старта AJAX-запросов.
*   **`ngDoCheck`**: Запускается при абсолютно каждом тике проверки изменений в приложении. Предназначен для кастомного отслеживания изменений, которые Angular не может зафиксировать сам.
*   **`ngAfterContentInit`**: Вызывается один раз после того, как Angular завершает проекцию внешнего контента (`<ng-content>`) в шаблон текущего компонента.
*   **`ngAfterViewInit`**: Вызывается один раз после полной инициализации представления текущего компонента и всех его дочерних элементов. Начиная с этого момента, шаблонные запросы `viewChild()` гарантированно возвращают ссылки на объекты, а не `undefined`.

---

### 2. Современная эволюция: afterNextRender, afterRenderEffect и SSR-безопасность
С развитием Server-Side Rendering (SSR) и Prerendering в Angular возникла архитектурная проблема при работе с классическими хуками:
*   Хуки `ngOnInit`, `ngOnChanges` и даже `ngAfterViewInit` выполняются как на стороне сервера (Node.js), так и на стороне клиента в браузере.
*   Попытка обратиться к глобальным объектам браузера (например, `window.localStorage`, `document.getElementById` или API отрисовки Canvas) внутри этих хуков на стороне сервера приведет к немедленному падению процесса сборки Node.js, так как этих API на сервере не существует.

Для обеспечения гарантированной изоляции браузерного кода в Angular 17-19+ внедрены новые функции:
1.  **`afterNextRender`**: Регистрирует колбэк, который гарантированно выполнится **только в браузере** один раз сразу после следующего завершенного цикла проверки изменений. Идеально для инициализации сторонних плагинов (например, графиков Chart.js, карт Leaflet) и чтения DOM-параметров.
2.  **`afterRender`**: Выполняется после каждого последующего цикла Change Detection в браузере. Подходит для синхронизации локального состояния с координатами прокрутки или размерами элементов.
3.  **`afterRenderEffect`** (Angular 19+): Комбинирует возможности сигнальных эффектов и браузерного рендеринга. Запускается на клиенте, позволяя реактивно отслеживать изменение сигналов и выполнять тяжелые манипуляции с DOM строго после того, как Angular завершил полную перерисовку страницы в браузере.

---

### 3. Детальный пошаговый разбор выполнения шаблона 2
1.  **Инстанцирование**: Angular создает экземпляр класса `Profile`. Запускается конструктор.
2.  **Регистрация рендеринга**: Вызывается `afterNextRender`. Angular не выполняет переданный колбэк немедленно, а сохраняет его в планировщик браузерных задач. Также в `DestroyRef` регистрируется колбэк уничтожения.
3.  **Первичные хуки**: Вызывается `ngOnInit()`. Запускается подписка на интервал `interval`. В `DestroyRef` дописывается вторая инструкция очистки.
4.  **Рендеринг**: Angular выполняет первый цикл Change Detection, строит DOM-структуру шаблона, рендерит канвас и завершает отрисовку кадра в браузере.
5.  **Выполнение браузерной логики**: Рантайм видит, что приложение работает в браузере и первый рендеринг завершен. Из планировщика извлекается колбэк `afterNextRender`. Сигнал `canvasRef()` успешно возвращает ссылку на нативный канвас, запускается метод `initCanvasChart` и рисует прямоугольник на экране.
6.  **Уничтожение**: При переходе на другую страницу Angular уничтожает `Profile`. Из `DestroyRef` последовательно извлекаются и выполняются все зарегистрированные колбэки: закрывается подписка на интервал таймера и выводится лог в консоль. Память полностью очищена.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Ошибка `ExpressionChangedAfterItHasBeenCheckedError` при мутации стейта в `ngAfterViewInit`**
    *   *Симптомы:* Критический сбой сборки или ошибка в консоли браузера в режиме разработки во время рендеринга.
    *   *Физика процесса:* Во время цикла проверки изменений Angular вычисляет значения шаблона, рендерит их и фиксирует состояние. Сразу после этого запускается хук `ngAfterViewInit`. Если внутри этого хука синхронно изменить свойство класса, влияющее на разметку шаблона, Angular при контрольном верификационном проходе зафиксирует несовпадение данных между рендером и моделью, что приведет к ошибке.
    *   *Решение:* Избегайте изменения состояния в хуках представления. Если это необходимо, оберните изменение в макрозадачу с помощью `setTimeout` (чтобы перенести изменение в следующий цикл макрозадач), либо примените ручной запуск цикла проверок через `ChangeDetectorRef.detectChanges()`.

```typescript
// ПЛОХО (Синхронное изменение состояния вызовет ExpressionChanged Error)
export class Profile implements AfterViewInit {
  activeTitle = 'Default';
  ngAfterViewInit() {
    this.activeTitle = 'Updated Title'; // ❌ Ошибка ExpressionChanged!
  }
}

// ХОРОШО (Перенос операции в следующую микро/макрозадачу решает проблему)
export class Profile implements AfterViewInit {
  activeTitle = 'Default';
  ngAfterViewInit() {
    setTimeout(() => {
      this.activeTitle = 'Updated Title'; // ✅ Безопасный перенос в следующий тик
    });
  }
}
```

*   **Ошибка 2: Падение SSR-сборки при попытке работы с `window` в классических хуках**
    *   *Симптомы:* Ошибка `ReferenceError: window is not defined` на сервере при сборке проекта или при серверном рендеринге (SSR).
    *   *Физика процесса:* Разработчик пытается прочитать данные из `localStorage` или получить координаты окна `window.innerWidth` внутри метода `ngOnInit`. На стороне сервера Node.js глобального объекта `window` не существует, что приводит к краху всего процесса.
    *   *Решение:* Перенесите весь код, обращающийся к браузерным API, внутрь функции `afterNextRender()`, либо используйте ручную проверку платформы через системную утилиту `isPlatformBrowser`.

```typescript
// ПЛОХО (Попытка обратиться к localStorage на сервере уронит процесс SSR)
export class Profile implements OnInit {
  ngOnInit() {
    const theme = localStorage.getItem('theme'); // ❌ ReferenceError на сервере!
  }
}

// ХОРОШО (afterNextRender гарантирует выполнение кода строго на клиенте в браузере)
export class Profile {
  constructor() {
    afterNextRender(() => {
      const theme = localStorage.getItem('theme'); // ✅ SSR-безопасное чтение
    });
  }
}
```

*   **Ошибка 3: Избыточные тяжелые вычисления внутри хуков проверки изменений**
    *   *Симптомы:* Резкая просадка FPS, зависание UI, постоянная загрузка процессора на 100%.
    *   *Физика процесса:* Разработчик поместил ресурсоемкие операции (например, фильтрацию больших массивов данных) внутрь хука `ngDoCheck` или `ngAfterViewChecked`. Эти методы запускаются при *любом* минорном событии в приложении, заставляя процессор бесконечно перевычислять данные.
    *   *Решение:* Перенесите тяжелые вычисления в реактивные сигналы `computed`. Они гарантируют ленивые кэшируемые расчеты исключительно при изменении зависимостей.

```typescript
// ПЛОХО (Тяжелый фильтр будет запускаться сотни раз при любых кликах и скролле)
export class Profile implements DoCheck {
  ngDoCheck() {
    this.filteredData = this.heavyFilter(this.largeArray); // ❌ Критическое падение FPS
  }
}

// ХОРОШО (computed выполнит тяжелые расчеты только при реальном изменении largeArray)
export class Profile {
  readonly largeArray = signal<number[]>([]);
  readonly filteredData = computed(() => this.heavyFilter(this.largeArray())); // ✅ Оптимально
}
```
