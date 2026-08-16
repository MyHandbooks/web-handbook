---
tags: [angular, сигналы, связь-компонентов, шаблоны]
related: ["[[Входные свойства на Сигналах (input).md]]", "[[Генерация событий через Output API.md]]", "[[Изменяемое реактивное состояние (signal).md]]"]
status: "completed"
---

# Двустороннее связывание (model, ModelSignal)

## БЫСТРЫЙ СТАРТ

*   **Функция `model()` (ModelSignal)** — реактивный примитив Angular 17.2+, который объединяет сигнальный вход (`input`) и выходное событие (`output`) в одно свойство, реализуя современный контракт двустороннего связывания данных (*Two-Way Data Binding*).
*   **Синтаксис «Banana-in-a-box» (`[(value)]`):** Родительский компонент может привязать свой сигнал к дочернему свойству `model()` через скобки `[(checked)]="mySignal"`. Изменение значения в родителе обновляет дочерний компонент, а вызов `.set()` или `.update()` внутри дочернего компонента автоматически обновляет сигнал родителя.
*   **Используйте для:** создания переиспользуемых UI-компонентов формы и дизайн-системы (кастомные чекбоксы, свитчи, ползунки, рейтинги, пагинаторы, модальные окна), где родитель и потомок должны синхронно управлять одним и тем же состоянием.
*   **Не используйте для:** однонаправленного потока данных, где дочерний компонент является чисто презентационным и не должен напрямую менять родительское состояние (в таких случаях используйте связку `input()` + `output()`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Кастомный компонент переключателя (CustomSwitch) с двусторонним сигналом
*   **Назначение:** Дочерний переиспользуемый UI-компонент переключателя, использующий `model<boolean>()` для синхронного двустороннего управления флагом активности.

#### 1. Файл логики дочернего компонента: `custom-switch.ts`
```typescript
import { Component, ChangeDetectionStrategy, model } from '@angular/core';

@Component({
  selector: 'app-custom-switch',
  templateUrl: './custom-switch.html',
  styleUrl: './custom-switch.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CustomSwitch {
  // Декларируем двусторонний сигнальный порт со значением по умолчанию false.
  // Автоматически создает доступный для записи ModelSignal<boolean>
  // и неявное выходное событие 'checkedChange' для родительского шаблона.
  public readonly checked = model<boolean>(false);

  public toggle(): void {
    // Вызов .update() не только меняет локальное состояние внутри CustomSwitch,
    // но и автоматически проталкивает новое значение в связанный сигнал родителя!
    this.checked.update((current) => !current);
  }
}
```

#### 2. Файл разметки дочернего компонента: `custom-switch.html`
```html
<button 
  type="button" 
  role="switch" 
  [attr.aria-checked]="checked()" 
  [class.switch-active]="checked()" 
  class="switch-track" 
  (click)="toggle()"
>
  <span class="switch-thumb"></span>
</button>
```

#### 3. Файл стилей дочернего компонента: `custom-switch.css`
```css
.switch-track {
  width: 48px;
  height: 26px;
  background-color: var(--border);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 2px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  transition: background-color var(--transition-speed), border-color var(--transition-speed);
}

.switch-track.switch-active {
  background-color: var(--accent);
  border-color: var(--accent);
}

.switch-thumb {
  width: 20px;
  height: 20px;
  background-color: #ffffff;
  border-radius: 50%;
  transition: transform var(--transition-speed);
  transform: translateX(0);
}

.switch-track.switch-active .switch-thumb {
  transform: translateX(22px);
}
```

#### 4. Файл логики родительского компонента: `settings-panel.ts`
```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CustomSwitch } from './custom-switch';

@Component({
  selector: 'app-settings-panel',
  imports: [CustomSwitch],
  templateUrl: './settings-panel.html',
  styleUrl: './settings-panel.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPanel {
  // Родительский сигнал — единый источник правды
  public readonly notificationsEnabled = signal<boolean>(true);

  public resetNotifications(): void {
    // Прямой сброс родительского сигнала синхронно изменит состояние в CustomSwitch
    this.notificationsEnabled.set(false);
  }
}
```

#### 5. Файл разметки родительского компонента: `settings-panel.html`
```html
<div class="settings-box">
  <div class="setting-row">
    <span>Уведомления: <b>{{ notificationsEnabled() ? 'Включены' : 'Отключены' }}</b></span>
    <!-- Двусторонняя привязка сигналов через синтаксис [(checked)] -->
    <app-custom-switch [(checked)]="notificationsEnabled" />
  </div>

  <button type="button" class="reset-btn" (click)="resetNotifications()">
    Сбросить в false из родителя
  </button>
</div>
```

#### 6. Файл стилей родительского компонента: `settings-panel.css`
```css
.settings-box {
  max-width: 420px;
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.reset-btn {
  padding: 8px 16px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-normal);
  border-radius: 6px;
  cursor: pointer;
}
```

---

### Шаблон 2: Обязательный `model.required()` с псевдонимом (Alias)
*   **Назначение:** Описание компонента пагинации, где номер страницы является обязательным входным параметром с кастомным именем для привязки в HTML.

#### 1. Файл логики компонента пагинации: `pagination-bar.ts`
```typescript
import { Component, ChangeDetectionStrategy, model } from '@angular/core';

@Component({
  selector: 'app-pagination-bar',
  templateUrl: './pagination-bar.html',
  styleUrl: './pagination-bar.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PaginationBar {
  // Обязательный model-сигнал с алиасом 'page'.
  // В родительском шаблоне привязка будет выглядеть как [(page)]="currentParentPage"
  public readonly pageIndex = model.required<number>({ alias: 'page' });

  public prevPage(): void {
    this.pageIndex.update((page) => Math.max(1, page - 1));
  }

  public nextPage(): void {
    this.pageIndex.update((page) => page + 1);
  }
}
```

#### 2. Файл разметки компонента пагинации: `pagination-bar.html`
```html
<div class="pagination-controls">
  <button type="button" (click)="prevPage()" [disabled]="pageIndex() <= 1">◀ Назад</button>
  <span class="page-indicator">Страница {{ pageIndex() }}</span>
  <button type="button" (click)="nextPage()">Вперед ▶</button>
</div>
```

#### 3. Файл стилей компонента пагинации: `pagination-bar.css`
```css
.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination-controls button {
  padding: 6px 12px;
  background-color: var(--accent);
  color: #ffffff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.pagination-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-indicator {
  font-weight: 600;
  color: var(--text-normal);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Как `model()` работает под капотом компилятора Ivy
До Angular 17 для реализации двустороннего связывания (`[(value)]="state"`) требовалось вручную объявлять пару:
```typescript
@Input() value: boolean = false;
@Output() valueChange = new EventEmitter<boolean>();
```
Разработчик должен был следить за точным соблюдением суффикса `Change` в названии `@Output()`, вручную перехватывать изменения через `ngOnChanges` или сеттеры и не забывать вызывать `this.valueChange.emit(newValue)`.

Функция `model()` полностью автоматизирует эту механику на уровне компилятора `ngtsc`:
1.  **Создание `ModelSignal`:** Внутри класса создается изменяемый сигнальный узел (`WritableSignal`), который одновременно реализует контракт чтения и записи.
2.  **Авто-генерация Output:** Компилятор Angular автоматически регистрирует невидимый выходной канал событий с суффиксом `Change` (например, `checked` $\rightarrow$ `checkedChange`, либо `page` $\rightarrow$ `pageChange` при использовании алиаса).
3.  **Автоматическая эмиссия:** Когда дочерний компонент вызывает `this.checked.set(newVal)` или `this.checked.update(...)`, `ModelSignal` мгновенно записывает значение в локальный сигнальный граф и немедленно инициирует эмиссию события `checkedChange.emit(newVal)` родителю.
4.  **Синхронизация с родителем:** Если родитель привязал `[(checked)]="parentSignal"`, родительский сигнал `parentSignal` синхронно обновляется полученным значением без написания шаблонных обработчиков событий `(checkedChange)="parentSignal.set($event)"`.

```text
Родительский компонент:                             Дочерний компонент (CustomSwitch):
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│ parentSignal = signal(true)     │                 │ checked = model<boolean>(false) │
│                                 │                 │                                 │
│ Разметка:                       │                 │ Разметка:                       │
│ <app-custom-switch              │  1. Вход [prop] │ <button                         │
│   [(checked)]="parentSignal" /> ├────────────────►│   (click)="checked.set(false)"> │
│                                 │                 │                                 │
│                                 │◄────────────────┤ Внутренний вызов .set()         │
│                                 │  2. Выход event │ триггерит checkedChange.emit()  │
└─────────────────────────────────┘                 └─────────────────────────────────┘
```

### 2. Разница между `input()`, `model()` и `linkedSignal()`
Важно четко понимать границы применения трех сигнальных примитивов:

| Характеристика | `input()` | `model()` | `linkedSignal()` |
| :--- | :--- | :--- | :--- |
| **Доступ на запись** | Только чтение (`InputSignal`) | Чтение и запись (`ModelSignal`) | Чтение и запись (`WritableSignal`) |
| **Направление данных** | Однонаправленное (Parent $\rightarrow$ Child) | Двунаправленное (Parent $\leftrightarrow$ Child) | Локальное (сброс по внешнему источнику) |
| **Обновление родителя** | Нет (нужен отдельный `output()`) | Да (автоматически обновляет родительский сигнал) | Нет (изменения остаются строго локальными) |
| **Связывание в HTML** | `[prop]="value"` | `[(prop)]="signal"` или `[prop]="value"` | Не привязывается напрямую в HTML как порт |

### 3. Детальный пошаговый разбор выполнения шаблона 1
1.  **Монтирование:** Компонент `SettingsPanel` инициализирует сигнал `notificationsEnabled` со значением `true`. Дочерний компонент `CustomSwitch` создается, и его `model()` получает начальное значение `true` от родителя.
2.  **Клик пользователя:** Пользователь нажимает на переключатель в дочернем компоненте. Срабатывает метод `toggle()`.
3.  **Мутация дочернего сигнала:** Выполняется `this.checked.update(curr => !curr)`. Значение внутри `CustomSwitch` становится `false`.
4.  **Синхронизация через Output:** `ModelSignal` под капотом вызывает автогенерированное событие `checkedChange.emit(false)`.
5.  **Обновление родителя:** Родительский сигнал `notificationsEnabled` в `SettingsPanel` принимает значение `false`.
6.  **Точечный рендеринг (Change Detection):** И в родителе (текст `Отключены`), и в дочернем переключателе (CSS-класс `switch-active`) разметка синхронно и точечно перерисовывается в рамках одного тика планировщика.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Попытка двусторонней привязки к не-сигналу без геттера/сеттера**
    *   *Симптомы:* Ошибка компиляции шаблона: `NG8002: Cannot bind to 'checked' since it is not a known property` или отсутствие обратной синхронизации данных в родительском компоненте.
    *   *Физика процесса:* Если в родительском шаблоне передать обычное свойство класса `[(checked)]="plainProperty"` без использования сигналов, двусторонняя привязка будет работать только в том случае, если родитель обрабатывает событие мутации. При работе с сигналами родителю достаточно передать имя сигнала без скобок вызова: `[(checked)]="parentSignal"`.
    *   *Решение:* Передавайте ссылку на родительский `WritableSignal` без круглых скобок `()`.

```html
<!-- ПЛОХО: Передача значения через вызов () ломает запись в сигнал -->
<app-custom-switch [(checked)]="notificationsEnabled()" />

<!-- ХОРОШО: Передача самого реактивного сигнала для двусторонней связи -->
<app-custom-switch [(checked)]="notificationsEnabled" />
```

*   **Ошибка 2: Использование `model()` вместо `input()` для данных только для чтения**
    *   *Симптомы:* Нарушение принципа однонаправленного потока данных (Unidirectional Data Flow), дочерний компонент неконтролируемо перезаписывает состояние родителя в обход бизнес-логики.
    *   *Физика процесса:* Разработчик объявил свойство как `model()`, но компонент задумывался как пассивный рендерер. Любой случайный вызов `.set()` внутри дочернего кода изменит данные родителя.
    *   *Решение:* Если дочерний компонент не должен менять родительское состояние напрямую, используйте строго `input()`.

*   **Ошибка 3: Конфликт ручного Output и автогенерированного `model()`**
    *   *Симптомы:* Ошибка компиляции: `Output 'checkedChange' collides with ModelSignal output`.
    *   *Физика процесса:* Разработчик объявил `public readonly checked = model(false)` и одновременно попытался вручную объявить `public readonly checkedChange = output<boolean>()`. Компилятор Angular генерирует `checkedChange` автоматически, поэтому ручное дублирование приводит к коллизии имен.
    *   *Решение:* Удалите ручной `output()`. Метод `model()` уже содержит встроенный канал вывода.
