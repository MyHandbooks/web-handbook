---
tags: [angular, сигналы, ssr, рендеринг, производительность]
related: ["[[Побочные эффекты (effect, untracked).md]]", "[[Изменяемое реактивное состояние (signal).md]]", "[[Жизненный цикл компонента Angular.md]]"]
status: "completed"
---

# Браузерные эффекты и SSR (afterRender, afterRenderEffect)

## БЫСТРЫЙ СТАРТ

*   **Проблема стандартного `effect()` при SSR:** Сигнальный эффект `effect()` выполняется как на стороне сервера (Node.js), так и на клиенте в браузере. Если поместить в `effect()` код обращения к `window`, `document`, `localStorage` или Canvas, серверный рендеринг упадет с критической ошибкой `ReferenceError: window is not defined`.
*   **Специализированные браузерные хуки (Angular 17–19+):**
    *   `afterNextRender(fn)` — выполняет функцию **ровно один раз строго в браузере** сразу после завершения следующей первичной отрисовки DOM. Идеально для однократной инициализации сторонних библиотек (Chart.js, Leaflet, D3).
    *   `afterRender(fn)` — запускает коллбэк **после каждого цикла перерисовки DOM в браузере**.
    *   `afterRenderEffect(fn)` (Angular 19+) — реактивный эффект, который отслеживает сигналы как стандартный `effect()`, но запускается **строго на клиенте после завершения отрисовки DOM**, гарантируя 100% безопасность для Server-Side Rendering (SSR).
*   **Используйте для:** чтения реальных геометрических размеров элементов в DOM (`getBoundingClientRect`, `offsetWidth`), синхронизации скролла, отрисовки графики на Canvas и работы с браузерными API.
*   **Не используйте для:** вычисления бизнес-данных (используйте `computed`) или стандартной записи в сигналы без надобности манипуляции DOM.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Безопасная инициализация сторонней библиотеки через `afterNextRender`
*   **Назначение:** Однократная инициализация интерактивного холста Canvas строго в браузере без падений сервера при сборке SSR.

#### 1. Файл логики компонента: `chart-canvas.ts`
```typescript
import { Component, ChangeDetectionStrategy, viewChild, ElementRef, afterNextRender } from '@angular/core';

@Component({
  selector: 'app-chart-canvas',
  templateUrl: './chart-canvas.html',
  styleUrl: './chart-canvas.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChartCanvas {
  // Ищем элемент Canvas в шаблоне через viewChild
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('renderCanvas');

  constructor() {
    // afterNextRender гарантирует, что коллбэк никогда не запустится на сервере в Node.js.
    // Код выполнится один раз, когда DOM-элемент canvas физически смонтирован в браузере.
    afterNextRender(() => {
      const canvasNode = this.canvasRef().nativeElement;
      this.initChartGraphics(canvasNode);
    });
  }

  private initChartGraphics(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Рисуем базовую графику
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(20, 20, 160, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = '14px sans-serif';
    ctx.fillText('SSR-Safe Canvas', 35, 55);
  }
}
```

#### 2. Файл разметки компонента: `chart-canvas.html`
```html
<div class="canvas-card">
  <h4>Интерактивная графика (SSR-Safe)</h4>
  <canvas #renderCanvas width="200" height="100" class="paint-area"></canvas>
</div>
```

#### 3. Файл стилей компонента: `chart-canvas.css`
```css
.canvas-card {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 260px;
}

.paint-area {
  margin-top: 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  display: block;
}
```

---

### Шаблон 2: Реактивное чтение геометрии DOM через `afterRenderEffect`
*   **Назначение:** Компонент отслеживает текст в сигнале, рендерит его и с помощью `afterRenderEffect` автоматически измеряет физическую высоту блока в пикселях после того, как браузер завершил отрисовку.

#### 1. Файл логики компонента: `box-measurer.ts`
```typescript
import { Component, ChangeDetectionStrategy, signal, viewChild, ElementRef, afterRenderEffect } from '@angular/core';

@Component({
  selector: 'app-box-measurer',
  templateUrl: './box-measurer.html',
  styleUrl: './box-measurer.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BoxMeasurer {
  // Сигнал, содержащий динамический текст
  public readonly dynamicText = signal<string>('Короткий текст');

  // Сигнал для сохранения физической высоты блока в DOM
  public readonly measuredHeightPx = signal<number>(0);

  private readonly contentBox = viewChild.required<ElementRef<HTMLDivElement>>('contentBox');

  constructor() {
    // afterRenderEffect отслеживает сигналы внутри своего тела.
    // Когда dynamicText() меняется, Angular сначала перерисовывает HTML в браузере,
    // и ТОЛЬКО ПОТОМ запускает этот эффект на клиенте для снятия реальных размеров!
    afterRenderEffect(() => {
      // Регистрируем зависимость от текста
      const text = this.dynamicText();
      const element = this.contentBox().nativeElement;

      // Безопасно считываем актуальные геометрические размеры после рендеринга
      const actualHeight = element.getBoundingClientRect().height;

      // Обновляем сигнальное состояние
      this.measuredHeightPx.set(Math.round(actualHeight));
      console.log(`[DOM Measure] Текст обновлен, физическая высота блока: ${actualHeight}px`);
    });
  }

  public expandText(): void {
    this.dynamicText.set(
      'Этот блок теперь содержит значительно больше текста. Он переносится на несколько строк, увеличивая общую физическую высоту DOM-контейнера в браузере.'
    );
  }

  public resetText(): void {
    this.dynamicText.set('Короткий текст');
  }
}
```

#### 2. Файл разметки компонента: `box-measurer.html`
```html
<div class="measurer-container">
  <div #contentBox class="content-box">
    {{ dynamicText() }}
  </div>

  <p class="height-indicator">Измеренная высота в DOM: <b>{{ measuredHeightPx() }}px</b></p>

  <div class="controls">
    <button type="button" (click)="expandText()">Увеличить текст</button>
    <button type="button" (click)="resetText()">Сбросить</button>
  </div>
</div>
```

#### 3. Файл стилей компонента: `box-measurer.css`
```css
.measurer-container {
  max-width: 380px;
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.content-box {
  padding: 12px;
  background-color: var(--bg-primary);
  border: 1px dashed var(--accent);
  border-radius: 6px;
  line-height: 1.5;
  color: var(--text-normal);
}

.height-indicator {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.controls {
  display: flex;
  gap: 8px;
}

.controls button {
  padding: 6px 12px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
```

---

### Шаблон 3: Фазовый рендеринг без Layout Thrashing в `afterRender`
*   **Назначение:** Оптимизация тяжелых операций со стилями путем разделения фаз чтения (Read) и записи (Write) для предотвращения просадок FPS при изменении геометрии.

#### 1. Файл логики компонента: `phased-styler.ts`
```typescript
import { Component, ChangeDetectionStrategy, viewChild, ElementRef, afterRender, AfterRenderPhase } from '@angular/core';

@Component({
  selector: 'app-phased-styler',
  templateUrl: './phased-styler.html',
  styleUrl: './phased-styler.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PhasedStyler {
  private readonly targetElement = viewChild.required<ElementRef<HTMLDivElement>>('stylerTarget');

  constructor() {
    let measuredWidth = 0;

    // Фаза 1: Сначала безопасно читаем размеры DOM (EarlyRead)
    afterRender({
      earlyRead: () => {
        const el = this.targetElement().nativeElement;
        measuredWidth = el.offsetWidth;
      },
      // Фаза 2: Затем пакетно записываем стили (Write), исключая Layout Thrashing
      write: () => {
        const el = this.targetElement().nativeElement;
        if (measuredWidth > 200) {
          el.style.borderLeftColor = 'var(--success-text)';
        } else {
          el.style.borderLeftColor = 'var(--accent)';
        }
      }
    });
  }
}
```

#### 2. Файл разметки компонента: `phased-styler.html`
```html
<div #stylerTarget class="styled-box">
  <p>Блок с оптимизированным фазовым рендерингом стилей.</p>
</div>
```

#### 3. Файл стилей компонента: `phased-styler.css`
```css
.styled-box {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-left: 6px solid var(--border);
  border-radius: 6px;
  max-width: 320px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная проблема `effect()` в SSR-контуре
В Server-Side Rendering приложении Angular код компилируется и выполняется дважды:
1.  **На сервере (Node.js):** Angular собирает HTML-строку для отправки клиенту (Fast Initial Load).
2.  **В браузере (Client Hydration):** JavaScript "оживляет" статическую разметку и подключает обработчики событий.

Если разработчик пишет:
```typescript
// ОШИБКА: effect() выполнится на сервере в среде Node.js!
effect(() => {
  const width = document.getElementById('my-box')?.offsetWidth;
  localStorage.setItem('cached_width', String(width));
});
```
На сервере этот код вызовет крах процесса Node.js (`ReferenceError: localStorage is not defined`), так как сервер не имеет графической подсистемы и браузерных API.

Функции `afterNextRender`, `afterRender` и `afterRenderEffect` на уровне ядра Angular спроектированы со строгой проверкой платформы: на сервере планировщик **полностью игнорирует эти хуки**, регистрируя их выполнение строго после старта клиента в браузере.

### 2. Фазы выполнения `afterRender` (Борьба с Layout Thrashing)
Когда JavaScript чередует чтение геометрии (`offsetWidth`) и запись стилей (`element.style.width = ...`), браузер вынужден экстренно останавливать JS-поток и принудительно пересчитывать макет страницы (Layout Thrashing), что приводит к лагам и просадкам FPS.

Angular 19 решает эту проблему за счет конвейера фаз `AfterRenderPhase`:

```text
Цикл рендеринга Angular в браузере:
 ┌────────────────────────────────────────────────────────┐
 │ 1. DOM Write (Angular обновляет шаблон компонента)     │
 └──────────────────────────┬─────────────────────────────┘
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │ 2. Phase: earlyRead (Чтение начальных размеров DOM)    │
 └──────────────────────────┬─────────────────────────────┘
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │ 3. Phase: write (Пакетная запись вычисленных стилей)   │
 └──────────────────────────┬─────────────────────────────┘
                            ▼
 ┌────────────────────────────────────────────────────────┐
 │ 4. Phase: read (Финальное контрольное чтение DOM)      │
 └────────────────────────────────────────────────────────┘
```

Разделение хуков на фазы гарантирует, что все чтения и записи всех компонентов на странице выполняются пакетно за один такт графического процессора.

### 3. Сравнение всех эффектов в Angular

| Примитив | Выполняется на сервере (SSR)? | Реактивен к Сигналам? | Когда запускается? |
| :--- | :---: | :---: | :--- |
| `effect()` | **Да** (по умолчанию) | Да | В очереди микрозадач при изменении сигналов |
| `afterNextRender()` | **Нет** (только браузер) | Нет | Однократно после первой отрисовки DOM |
| `afterRender()` | **Нет** (только браузер) | Нет | После каждого тика перерисовки DOM |
| `afterRenderEffect()` | **Нет** (только браузер) | **Да** | После перерисовки DOM при изменении сигналов |

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Попытка чтения нулевых размеров DOM в `ngOnInit` или `constructor`**
    *   *Симптомы:* Метод `element.offsetWidth` или `getBoundingClientRect()` возвращает `0`, либо элемент равен `undefined`.
    *   *Физика процесса:* В момент выполнения конструктора или `ngOnInit` разметка шаблона еще физически не скомпилирована в реальное DOM-дерево браузера. Элемент имеет нулевые размеры.
    *   *Решение:* Переносите чтение реальных размеров элементов в `afterNextRender()` или `afterRenderEffect()`.

*   **Ошибка 2: Бесконечный цикл при записи в сигналы внутри `afterRender`**
    *   *Симптомы:* Зависание браузера, ошибка: `NG0103: Infinite change detection loop detected`.
    *   *Физика процесса:* Разработчик вызывает `afterRender(() => this.mySignal.set(10))`. Изменение `mySignal` запускает Change Detection, который перерисовывает DOM, что снова вызывает `afterRender`, зацикливая выполнение.
    *   *Решение:* Если вам нужно реактивно реагировать на изменение сигналов и читать DOM, используйте `afterRenderEffect()` (он запускается только тогда, когда реально изменились сигналы-зависимости, а не на каждый чих Change Detection).

*   **Ошибка 3: Вызов `afterNextRender` вне контекста внедрения (Injection Context)**
    *   *Симптомы:* Ошибка рантайма: `afterNextRender() must be called from an active injection context`.
    *   *Физика процесса:* Функция вызвана внутри обычного метода (например, обработчика клика `onClick()`), когда контекст внедрения зависимостей уже закрыт.
    *   *Решение:* Объявляйте хуки `afterNextRender`, `afterRender` и `afterRenderEffect` в `constructor()` класса или передавайте `Injector` явно через опцию `{ injector: this.injector }`.
