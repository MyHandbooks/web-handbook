---
tags: [angular, сигналы, связь-компонентов, шаблоны, dom]
related: ["[[Поиск дочерних элементов (viewChild).md]]", "[[Каркас с мультислотовой проекцией (ng-content).md]]", "[[Декларативные вычисления (computed).md]]"]
status: "completed"
---

# Множественные сигнальные запросы (viewChildren, contentChildren, contentChild)

## БЫСТРЫЙ СТАРТ

*   **Сигнальные запросы запросов вида и контента (`viewChildren`, `contentChild`, `contentChildren`)** — это современные функции Angular 17.2+, которые полностью заменяют устаревшие декораторы `@ViewChildren()`, `@ContentChild()` и `@ContentChildren()`.
*   **Реактивность запросов:** Вместо тяжелых и мутабельных коллекций `QueryList` сигнальные запросы возвращают стандартный `Signal<ReadonlyArray<T>>` (для множественных запросов) или `Signal<T | undefined>` (для единичных). При добавлении или удалении элементов в DOM/шаблоне массив в сигнале обновляется иммутабельно.
*   **Разница между View и Content:**
    *   `viewChild` / `viewChildren` — ищут элементы и компоненты **внутри собственного HTML-шаблона** текущего компонента.
    *   `contentChild` / `contentChildren` — ищут элементы и компоненты, которые были **спроецированы родителем через `<ng-content>`** (Content Projection).
*   **Используйте для:** создания составных UI-компонентов (аккордеоны, группы вкладок, списки элементов с выбором, кастомные тулбары), сбора коллекций нативных DOM-элементов или динамического подсчета спроецированных дочерних элементов.
*   **Не используйте:** для передачи бизнес-данных от родителя к потомку (для этого предназначен `input()`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Множественный поиск элементов шаблона через `viewChildren`
*   **Назначение:** Родительский компонент панели инструментов находит все дочерние кнопки в своем шаблоне и динамически управляет фокусом с помощью клавиатуры (стрелками).

#### 1. Файл логики компонента панели: `action-toolbar.ts`
```typescript
import { Component, ChangeDetectionStrategy, viewChildren, ElementRef, computed } from '@angular/core';

@Component({
  selector: 'app-action-toolbar',
  templateUrl: './action-toolbar.html',
  styleUrl: './action-toolbar.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ActionToolbar {
  // viewChildren находит ВСЕ кнопки с локальным маркером #actionBtn.
  // Возвращает Signal<ReadonlyArray<ElementRef<HTMLButtonElement>>>.
  // Коллекция обновляется автоматически при добавлении/удалении кнопок через @for/@if.
  public readonly actionButtons = viewChildren<ElementRef<HTMLButtonElement>>('actionBtn');

  // Декларативно вычисляем общее количество доступных кнопок
  public readonly totalButtonsCount = computed(() => this.actionButtons().length);

  public focusFirstButton(): void {
    const buttons = this.actionButtons();
    if (buttons.length > 0) {
      buttons[0].nativeElement.focus();
    }
  }

  public focusLastButton(): void {
    const buttons = this.actionButtons();
    if (buttons.length > 0) {
      buttons[buttons.length - 1].nativeElement.focus();
    }
  }
}
```

#### 2. Файл разметки компонента панели: `action-toolbar.html`
```html
<div class="toolbar-box">
  <div class="toolbar-header">
    <h4>Панель действий (Кнопок в DOM: {{ totalButtonsCount() }})</h4>
    <div class="quick-nav">
      <button type="button" class="nav-btn" (click)="focusFirstButton()">Фокус на первую</button>
      <button type="button" class="nav-btn" (click)="focusLastButton()">Фокус на последнюю</button>
    </div>
  </div>

  <div class="buttons-row">
    <button #actionBtn type="button" class="tool-btn">Создать</button>
    <button #actionBtn type="button" class="tool-btn">Редактировать</button>
    <button #actionBtn type="button" class="tool-btn">Клонировать</button>
    <button #actionBtn type="button" class="tool-btn btn-danger">Удалить</button>
  </div>
</div>
```

#### 3. Файл стилей компонента панели: `action-toolbar.css`
```css
.toolbar-box {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 520px;
}

.toolbar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.quick-nav {
  display: flex;
  gap: 6px;
}

.nav-btn {
  font-size: 0.75rem;
  padding: 4px 8px;
  background: none;
  border: 1px dashed var(--border);
  color: var(--text-muted);
  border-radius: 4px;
  cursor: pointer;
}

.buttons-row {
  display: flex;
  gap: 8px;
}

.tool-btn {
  padding: 8px 14px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-normal);
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: border-color var(--transition-speed);
}

.tool-btn:focus {
  outline: 2px solid var(--accent);
  border-color: var(--accent);
}

.btn-danger {
  color: var(--error-text);
  border-color: var(--error-bg);
}
```

---

### Шаблон 2: Составной компонент вкладок через `contentChildren` и `contentChild`
*   **Назначение:** Реализация переиспользуемого контейнера табов (`TabGroup`), который отслеживает все спроецированные через `<ng-content>` дочерние элементы (`TabItem`) с помощью `contentChildren()`.

#### 1. Файл логики дочернего элемента вкладки: `tab-item.ts`
```typescript
import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';

@Component({
  selector: 'app-tab-item',
  templateUrl: './tab-item.html',
  styleUrl: './tab-item.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TabItem {
  // Название вкладки передается через входной сигнал
  public readonly title = input.required<string>();

  // Сигнал активности вкладки, управляемый родительским контейнером TabGroup
  public readonly isActive = signal<boolean>(false);
}
```

#### 2. Файл разметки дочернего элемента вкладки: `tab-item.html`
```html
@if (isActive()) {
  <div class="tab-pane">
    <ng-content />
  </div>
}
```

#### 3. Файл стилей дочернего элемента вкладки: `tab-item.css`
```css
.tab-pane {
  padding: 16px 0;
  color: var(--text-normal);
  line-height: 1.5;
}
```

#### 4. Файл логики родительского контейнера вкладок: `tab-group.ts`
```typescript
import { Component, ChangeDetectionStrategy, contentChildren, effect } from '@angular/core';
import { TabItem } from './tab-item';

@Component({
  selector: 'app-tab-group',
  templateUrl: './tab-group.html',
  styleUrl: './tab-group.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TabGroup {
  // contentChildren находит ВСЕ компоненты TabItem, переданные в <ng-content>.
  // Возвращает Signal<ReadonlyArray<TabItem>>.
  public readonly tabs = contentChildren(TabItem);

  constructor() {
    // Реактивно активируем первую вкладку, как только список спроецированных табов становится доступен
    effect(() => {
      const allTabs = this.tabs();
      if (allTabs.length > 0 && !allTabs.some(t => t.isActive())) {
        allTabs[0].isActive.set(true);
      }
    });
  }

  public selectTab(selectedTab: TabItem): void {
    // Снимаем активность со всех табов и активируем выбранный
    this.tabs().forEach(tab => {
      tab.isActive.set(tab === selectedTab);
    });
  }
}
```

#### 5. Файл разметки родительского контейнера вкладок: `tab-group.html`
```html
<div class="tab-group-container">
  <!-- Шапка вкладок генерируется динамически на основе сигнального массива tabs() -->
  <div class="tab-nav-bar">
    @for (tab of tabs(); track tab.title()) {
      <button 
        type="button" 
        class="tab-nav-btn" 
        [class.active]="tab.isActive()" 
        (click)="selectTab(tab)"
      >
        {{ tab.title() }}
      </button>
    }
  </div>

  <!-- Слот проекции для рендеринга переданных тегов app-tab-item -->
  <div class="tab-content-area">
    <ng-content />
  </div>
</div>
```

#### 6. Файл стилей родительского контейнера вкладок: `tab-group.css`
```css
.tab-group-container {
  border: 1px solid var(--border);
  border-radius: 8px;
  background-color: var(--bg-secondary);
  overflow: hidden;
  max-width: 500px;
}

.tab-nav-bar {
  display: flex;
  background-color: var(--bg-primary);
  border-bottom: 1px solid var(--border);
}

.tab-nav-btn {
  flex: 1;
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-weight: 600;
  cursor: pointer;
  transition: color var(--transition-speed), border-color var(--transition-speed);
}

.tab-nav-btn:hover {
  color: var(--text-normal);
}

.tab-nav-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.tab-content-area {
  padding: 16px;
}
```

---

### Шаблон 3: Проекция заголовка через обязательный `contentChild.required`
*   **Назначение:** Компонент модального окна требует наличия обязательного спроецированного элемента заголовка с маркером `#modalHeader`.

#### 1. Файл логики диалога: `dialog-shell.ts`
```typescript
import { Component, ChangeDetectionStrategy, contentChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-dialog-shell',
  templateUrl: './dialog-shell.html',
  styleUrl: './dialog-shell.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DialogShell {
  // contentChild.required гарантирует, что родитель передал элемент в слот проекции.
  // Тип сигнала — Signal<ElementRef<HTMLElement>> (без undefined).
  public readonly headerElement = contentChild.required<ElementRef<HTMLElement>>('modalHeader');
}
```

#### 2. Файл разметки диалога: `dialog-shell.html`
```html
<div class="dialog-frame">
  <div class="dialog-header-zone">
    <!-- Сюда попадет обязательный спроецированный заголовок -->
    <ng-content select="[modalHeader]" />
  </div>

  <div class="dialog-body-zone">
    <!-- Сюда попадет остальной контент диалога -->
    <ng-content />
  </div>
</div>
```

#### 3. Файл стилей диалога: `dialog-shell.css`
```css
.dialog-frame {
  border: 1px solid var(--border);
  background-color: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  max-width: 400px;
}

.dialog-header-zone {
  border-bottom: 1px solid var(--border);
  padding-bottom: 8px;
  margin-bottom: 12px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная замена `QueryList` на чистые `ReadonlyArray`
В классическом Angular (до версий 17.2+) запросы `@ViewChildren()` и `@ContentChildren()` возвращали мутабельный контейнер `QueryList<T>`.

Проблемы старого подхода `QueryList`:
1.  **Несовместимость с OnPush и Сигналами:** `QueryList` являлся RxJS-подобной структурой, требовал подписки на событие `.changes` и ручного вызова `ChangeDetectorRef.markForCheck()`.
2.  **Случайная мутация:** Коллекция мутировала по ссылке «на месте», из-за чего реактивные проверки ссылочного равенства (`===`) не фиксировали изменения.

В сигнальных запросах `viewChildren()` и `contentChildren()` возвращается стандартный `Signal<ReadonlyArray<T>>`:
*   При каждом изменении DOM-узлов (например, сработал цикл `@for` или блок `@if`) компилятор Ivy генерирует **совершенно новый массив по новой ссылке**.
*   Это позволяет напрямую подключать коллекции к `computed()` (как показано в Шаблоне 1 с подсчетом кнопок `totalButtonsCount`) без написания подписок и хуков жизненного цикла `ngAfterViewInit` / `ngAfterContentInit`.

### 2. Сравнение всех сигнальных запросов Angular

| Функция | Область поиска | Множественность | Возвращаемый тип | Исключение при отсутствии |
| :--- | :--- | :--- | :--- | :--- |
| `viewChild()` | Собственный шаблон | Один | `Signal<T \| undefined>` | Нет (`undefined`) |
| `viewChild.required()` | Собственный шаблон | Один | `Signal<T>` | Да (NG02802) |
| `viewChildren()` | Собственный шаблон | Коллекция | `Signal<ReadonlyArray<T>>` | Нет (пустой `[]`) |
| `contentChild()` | Проекция (`ng-content`) | Один | `Signal<T \| undefined>` | Нет (`undefined`) |
| `contentChild.required()` | Проекция (`ng-content`) | Один | `Signal<T>` | Да (NG02802) |
| `contentChildren()` | Проекция (`ng-content`) | Коллекция | `Signal<ReadonlyArray<T>>` | Нет (пустой `[]`) |

### 3. Опция `read` в множественных запросах
По умолчанию, если вы запрашиваете компонент: `viewChildren(MyCard)`, Angular возвращает массив экземпляров классов `MyCard`.

Если вам требуется получить доступ к нативным DOM-нодам этих компонентов (например, для измерения геометрических размеров или анимации) или к определенной директиве, наложенной на них, используется опция `{ read: ... }`:

```typescript
// Получаем доступ к нативным DOM-узлам компонентов
public readonly cardElements = viewChildren(MyCard, { read: ElementRef });

// Получаем доступ к кастомной директиве тултипа на этих компонентах
public readonly cardTooltips = viewChildren(MyCard, { read: TooltipDirective });
```

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Поиск спроецированного контента через `viewChildren` вместо `contentChildren`**
    *   *Симптомы:* Метод `viewChildren(TabItem)` возвращает пустой массив `[]`, хотя в HTML-разметке родителя дочерние элементы `<app-tab-item>` физически переданы внутрь `<app-tab-group>`.
    *   *Физика процесса:* `viewChildren` ищет элементы только внутри HTML-файла самого компонента `tab-group.html`. Спроецированные через `<ng-content>` теги принадлежат лексической области родителя и могут быть обнаружены только через `contentChildren`.
    *   *Решение:* Замените `viewChildren` на `contentChildren` для любых элементов, передаваемых между открывающим и закрывающим тегами компонента.

```typescript
// ПЛОХО: Не найдет элементы, переданные через <ng-content>
public readonly tabs = viewChildren(TabItem); // Всегда пустой []

// ХОРОШО: Правильный поиск спроецированного контента
public readonly tabs = contentChildren(TabItem);
```

*   **Ошибка 2: Попытка мутации возвращенного массива**
    *   *Симптомы:* Ошибка компиляции TypeScript: `Property 'push' does not exist on type 'readonly T[]'`.
    *   *Физика процесса:* Массив внутри сигнала типизирован как `ReadonlyArray<T>`. Это сделано специально для защиты от случайной мутации данных в обход внутренних механизмов компилятора Angular.
    *   *Решение:* Рассматривайте коллекцию строго как источник только для чтения. Если вам нужно отфильтровать или изменить список, создавайте новый массив через стандартные методы `.filter()` или `.map()`.

*   **Ошибка 3: Ошибка времени выполнения при использовании `.required()` на динамических элементах**
    *   *Симптомы:* Приложение аварийно завершает работу с ошибкой: `NG02802: A required content query did not find any matching results`.
    *   *Физика процесса:* Разработчик использовал `contentChild.required('header')`, но родительский компонент скрыл этот заголовок с помощью директивы `@if (showBonusHeader)`. Так как элемент отсутствует при первичной инициализации, модификатор `.required()` выбрасывает фатальную ошибку.
    *   *Решение:* Используйте стандартный `contentChild('header')` без `.required()` для любых элементов, которые могут условно появляться или скрываться в рантайме.
