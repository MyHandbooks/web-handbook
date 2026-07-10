---
tags: [angular, performance, ngzone]
related: ["[[Zoneless-архитектура без Zone.js (provideExperimentalZonelessChangeDetection).md]]"]
status: "completed"
---

# Выполнение операций вне зоны через NgZone

## БЫСТРЫЙ СТАРТ

*   **Библиотека `zone.js`** — это системный движок Angular, который перехватывает (monkey-patches) все асинхронные API браузера (таймеры, события мыши/клавиатуры, HTTP-запросы, промисы). При завершении любой асинхронной операции `zone.js` автоматически сообщает Angular о необходимости запустить глобальный цикл проверки изменений (Change Detection).
*   **Служба `NgZone`** — это обертка Angular над `zone.js`. Она позволяет вручную управлять границами зоны автоматической проверки изменений.
*   **Метод `runOutsideAngular(callback)`** выполняет переданную функцию полностью в обход зоны Angular. События, генерируемые внутри этого колбэка, не будут триггерить проверку изменений, сохраняя высокую производительность и FPS.
*   **Метод `run(callback)`** возвращает поток выполнения обратно в зону Angular, когда необходимо точечно обновить пользовательский интерфейс.
*   **Используйте:** Для обработки частых, высокоинтенсивных событий (`scroll`, `mousemove`, `drag`, `resize`), анимационных циклов `requestAnimationFrame`, быстрого потока данных из WebSockets или Server-Sent Events (SSE).
*   **Не используйте:** Для стандартных бизнес-операций (например, кликов по кнопкам или одиночных HTTP-запросов), так как автоматический Change Detection фреймворка спроектирован для корректного и безопасного обновления UI в этих сценариях.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Высокопроизводительное отслеживание скролла (ScrollTracker)
*   **Назначение:** Компонент отслеживает положение скролла страницы вне зоны Angular, обновляя ширину индикатора прогресса чтения. Возвращается в зону только тогда, когда пользователь прокрутил страницу до конца.

#### 1. Файл логики компонента: `scroll-tracker.ts`
```typescript
import { Component, ChangeDetectionStrategy, OnInit, inject, NgZone, ElementRef, viewChild, DestroyRef, signal } from '@angular/core';

@Component({
  selector: 'app-scroll-tracker',
  templateUrl: './scroll-tracker.html',
  styleUrl: './scroll-tracker.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ScrollTracker implements OnInit {
  private readonly zone = inject(NgZone); // Внедряем службу управления зоной
  private readonly destroyRef = inject(DestroyRef); // Понадобится для отписки

  // Ищем элемент прогресс-бара в шаблоне
  private readonly progressBar = viewChild.required<ElementRef<HTMLDivElement>>('progressBar');

  // Реактивный сигнал для вывода уведомления о завершении чтения
  public readonly isReadingFinished = signal<boolean>(false);

  public ngOnInit(): void {
    // Выполняем подписку на скролл вне зоны Angular!
    // Zone.js не узнает об этих событиях, и FPS не просядет
    this.zone.runOutsideAngular(() => {
      const onScrollHandler = (): void => {
        this.calculateScrollProgress();
      };

      window.addEventListener('scroll', onScrollHandler, { passive: true });

      // Очищаем слушатель при уничтожении компонента
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScrollHandler);
      });
    });
  }

  private calculateScrollProgress(): void {
    const docEl = document.documentElement;
    const scrollTop = docEl.scrollTop || document.body.scrollTop;
    const scrollHeight = docEl.scrollHeight || document.body.scrollHeight;
    const clientHeight = docEl.clientHeight;

    const scrolledPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;

    // Прямо манипулируем стилем элемента вне зоны. Никакого Change Detection!
    const barElement = this.progressBar().nativeElement;
    barElement.style.width = `${scrolledPercent}%`;

    // Если пользователь докрутил до конца и флаг еще не выставлен
    if (scrolledPercent >= 99 && !this.isReadingFinished()) {
      // Возвращаемся в зону Angular, чтобы реактивно обновить интерфейс и отобразить плашку
      this.zone.run(() => {
        this.isReadingFinished.set(true);
      });
    }
  }
}
```

#### 2. Файл разметки компонента: `scroll-tracker.html`
```html
<div class="progress-container">
  <!-- Индикатор, ширина которого динамически меняется вне зоны Angular -->
  <div #progressBar class="progress-bar"></div>
</div>

<div class="content-viewport">
  <p>Прокрутите эту длинную страницу вниз для тестирования производительности...</p>
  <div class="spacer"></div>
  
  @if (isReadingFinished()) {
    <div class="completion-banner">
      <p>🎉 Спасибо, что дочитали конспект до конца!</p>
    </div>
  }
</div>
```

#### 3. Файл стилей компонента: `scroll-tracker.css`
```css
.progress-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background-color: var(--border);
  z-index: 1000;
}

.progress-bar {
  width: 0%;
  height: 100%;
  background-color: var(--accent);
  transition: width 0.1s ease-out;
}

.content-viewport {
  padding: 40px 24px;
}

.spacer {
  height: 150vh; /* Создаем искусственную высоту скролла */
}

.completion-banner {
  padding: 16px;
  background-color: var(--success-bg);
  color: var(--success-text);
  border: 1px solid var(--border);
  border-radius: 8px;
  text-align: center;
}
```

---

### Шаблон 2: Анимационный цикл Canvas на requestAnimationFrame (CanvasAnimator)
*   **Назначение:** Высокопроизводительный рендер-цикл графики на Canvas, работающий полностью вне Angular с частотой 60 кадров в секунду без ложных срабатываний Change Detection.

#### 1. Файл логики компонента: `canvas-animator.ts`
```typescript
import { Component, ChangeDetectionStrategy, OnInit, inject, NgZone, ElementRef, viewChild, DestroyRef } from '@angular/core';

@Component({
  selector: 'app-canvas-animator',
  templateUrl: './canvas-animator.html',
  styleUrl: './canvas-animator.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanvasAnimator implements OnInit {
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('renderCanvas');
  private animationFrameId = 0;

  public ngOnInit(): void {
    // Запускаем весь анимационный цикл вне зоны Angular
    this.zone.runOutsideAngular(() => {
      const canvas = this.canvasRef().nativeElement;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let posX = 0;
      let speed = 2;

      const renderLoop = (): void => {
        // Очищаем холст
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Рисуем анимированную фигуру
        ctx.fillStyle = '#a855f7'; // var(--accent) в шестнадцатеричном формате
        ctx.beginPath();
        ctx.arc(posX, canvas.height / 2, 20, 0, Math.PI * 2);
        ctx.fill();

        // Обновляем позицию
        posX += speed;
        if (posX > canvas.width || posX < 0) {
          speed = -speed; // Меняем направление движения при соударении со стенкой
        }

        // Запрашиваем следующий кадр анимации
        this.animationFrameId = requestAnimationFrame(renderLoop);
      };

      // Инициируем первый кадр
      this.animationFrameId = requestAnimationFrame(renderLoop);

      // Гарантируем остановку цикла анимации при уничтожении компонента
      this.destroyRef.onDestroy(() => {
        cancelAnimationFrame(this.animationFrameId);
      });
    });
  }
}
```

#### 2. Файл разметки компонента: `canvas-animator.html`
```html
<div class="canvas-wrapper">
  <h3>Графика Canvas вне зоны Angular</h3>
  <canvas #renderCanvas width="400" height="150" class="game-canvas"></canvas>
  <p class="description">Цикл работает со скоростью 60 FPS. Ни одного запуска Change Detection не происходит во время движения круга.</p>
</div>
```

#### 3. Файл стилей компонента: `canvas-animator.css`
```css
.canvas-wrapper {
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 440px;
}

.game-canvas {
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: block;
  margin: 16px 0;
}

.description {
  font-size: 0.85rem;
  color: var(--text-muted);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Как Zone.js патчит асинхронные API браузера
Zone.js — это библиотека, которая внедряется в глобальную область видимости при старте Angular-приложения и переопределяет стандартные прототипы браузерных методов (механизм Monkey-patching).

*   **Как это устроено:**
    Zone.js заменяет стандартные функции, такие как `window.addEventListener`, `setTimeout`, `fetch` или `Promise.resolve`, своими собственными обертками.
*   **Схема перехвата выполнения:**
    1. Компонент вызывает `setTimeout(callback, 1000)`.
    2. Вызов перехватывается Zone.js. Она запускает таймер нативного API, но оборачивает его колбэк в специальный контекст.
    3. По истечении 1000 мс колбэк выполняется, и Zone.js мгновенно генерирует внутреннее системное событие `onMicrotaskEmpty` (микрозадачи выполнены, стек пуст).
    4. Angular подписан на это событие. Получив сигнал от зоны, фреймворк запускает глобальную проверку изменений — Change Detection (`ApplicationRef.tick()`), сканируя дерево компонентов сверху вниз для обновления UI.

Если в вашем приложении работает фоновый `setInterval` (например, для проверки сессии раз в 5 секунд), Angular будет каждые 5 секунд полностью перепроверять всё дерево компонентов, даже если на экране абсолютно ничего не изменилось.

### 2. Механика runOutsideAngular и run
Служба `NgZone` решает проблему холостых запусков Change Detection, позволяя временно выйти из-под наблюдения Zone.js.

```typescript
this.zone.runOutsideAngular(() => {
  // Весь асинхронный код внутри этой зоны выполняется без надзора со стороны Zone.js.
  // Вызовы setTimeout, setInterval илиaddEventListener не будут приводить к ApplicationRef.tick()
});
```

*   **`runOutsideAngular(fn)`:**
    Выполняет функцию `fn` в родительской зоне (Parent Zone), которая лежит выше зоны Angular (`angular` zone). В этой родительской зоне перехватчики отключены.
*   **`run(fn)`:**
    Возвращает стек вызова обратно в зону Angular. Это принудительно восстанавливает стандартный надзор. Всё, что изменится внутри `run()`, будет корректно зафиксировано при следующем автоматическом цикле Change Detection, который Angular запланирует незамедлительно.

---

### 3. Типичные ошибки и их решение

*   **Ошибка 1: Потеря обновления интерфейса (UI Freeze)**
    *   *Симптомы:* Асинхронная операция выполнилась, значения переменных в компоненте изменились, но на экране по-прежнему отображаются старые данные.
    *   *Физика процесса:* Разработчик перенес тяжелую операцию вне зоны через `runOutsideAngular`, но забыл вернуть ее результат обратно в зону Angular. Поскольку операция завершилась за пределами зоны, `zone.js` не узнала о ее завершении, и Angular не запустил Change Detection. Экран "завис".
    *   *Решение:* Перенесите финальное обновление реактивного состояния или переменных компонента внутрь вызова `this.zone.run()`.

```typescript
// ПЛОХО (Событие пришло, но UI не обновится до тех пор, пока не произойдет какой-то клик на странице)
this.zone.runOutsideAngular(() => {
  this.ws.onMessage(data => {
    this.messageText = data; 
  });
});

// ХОРОШО (Событие обрабатывается быстро вне зоны, а запись данных происходит внутри зоны)
this.zone.runOutsideAngular(() => {
  this.ws.onMessage(data => {
    // Тяжелый парсинг данных...
    const parsed = JSON.parse(data);

    this.zone.run(() => {
      // Возвращаемся в зону для обновления UI
      this.messageText.set(parsed.text); 
    });
  });
});
```

*   **Ошибка 2: Ложная защита при использовании `@HostListener`**
    *   *Симптомы:* Разработчик пытается оптимизировать скролл, обернув код в `runOutsideAngular`, но CPU по-прежнему загружен на 100%, и Change Detection срабатывает на каждый пиксель прокрутки.
    *   *Физика процесса:* Ошибка кроется в использовании декоратора `@HostListener`:
        ```typescript
        // ОШИБКА: `@HostListener` перехватывается Zone.js на этапе инициализации класса,
        // поэтому Change Detection сработает ДО того, как управление передастся внутрь метода!
        @HostListener('window:scroll')
        public onScroll() {
          this.zone.runOutsideAngular(() => { ... });
        }
        ```
    *   *Решение:* Если вам нужно обрабатывать события вне зоны Angular, никогда не используйте `@HostListener`. Регистрируйте слушатели событий вручную на нативном DOM-элементе с помощью метода `addEventListener` строго внутри тела `runOutsideAngular` (как показано в Шаблоне 1).

*   **Ошибка 3: Утечки памяти из-за "осиротевших" фоновых процессов вне зоны**
    *   *Симптомы:* Плавное нарастание потребления оперативной памяти, тормоза приложения после многократных переходов пользователя по страницам.
    *   *Физика процесса:* Разработчик запустил бесконечный цикл `requestAnimationFrame` или `setInterval` внутри `runOutsideAngular` компонента. Поскольку эти процессы выполняются вне зоны, разработчик ошибочно полагает, что они безопасны. Однако при уничтожении компонента эти таймеры продолжают крутиться в памяти браузера, удерживая ссылки на уничтоженный класс компонента и не давая сборщику мусора (Garbage Collector) очистить память.
    *   *Решение:* Всегда сохраняйте ссылки на таймеры (`timeoutId`, `intervalId`, `animationFrameId`) и принудительно останавливайте их при деструкции компонента в хуке `onDestroy` службы `DestroyRef` (как показано в Шаблонах 1 и 2).