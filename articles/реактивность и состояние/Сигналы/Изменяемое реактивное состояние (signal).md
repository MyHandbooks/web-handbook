---
tags: [angular, сигналы, архитектура]
related: ["[[Декларативные вычисления (computed).md]]", "[[Побочные эффекты (effect, untracked).md]]", "[[Динамический сброс состояния (linkedSignal).md]]"]
status: "completed"
---

# Изменяемое реактивное состояние (signal)

## БЫСТРЫЙ СТАРТ

*   **Сигнал (`WritableSignal<T>`)** — базовый реактивный примитив синхронного состояния в современном Angular. Он представляет собой легковесную обертку над значением, которая автоматически отслеживает, кто и где считывает это значение (зависимости), и уведомляет систему об изменениях.
*   **Базовые операции работы:**
    *   **Чтение:** `mySignal()` — считывает текущее значение. Если это происходит внутри реактивного контекста (шаблона, `computed` или `effect`), Angular регистрирует зависимость.
    *   **Перезапись:** `mySignal.set(newValue)` — принудительно заменяет старое значение новым.
    *   **Обновление:** `mySignal.update(fn)` — вычисляет новое значение на основе старого (например, `count.update(val => val + 1)`).
*   **Правила использования:**
    *   **Используйте:** Для хранения локального состояния UI (флаги открытия окон, состояния чекбоксов, текст поисковой строки, значения локальных форм).
    *   **Не используйте:** Для вычисления производных значений (для этого строго используйте `computed`), а также для асинхронных потоков данных и сетевых запросов (используйте RxJS или встроенный `resource` API).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Управление примитивным состоянием (Переключатели и счетчики)
*   **Назначение:** Реализация простейшего изменения атомарных типов данных (boolean, number, string) через методы `.set()` и `.update()`.

#### 1. Файл логики: `simple-counter.ts`
```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

@Component({
  selector: 'app-simple-counter',
  // standalone: true опускается по умолчанию начиная с v19
  imports: [],
  templateUrl: './simple-counter.html',
  styleUrl: './simple-counter.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SimpleCounter { // Имя класса очищено от суффикса Component
  // Инициализируем изменяемый сигнал с начальным числовым значением
  public readonly clickCount = signal<number>(0);
  
  // Инициализируем изменяемый сигнал с логическим флагом
  public readonly isPanelOpen = signal<boolean>(false);

  /**
   * Инкрементирует значение на основе предыдущего состояния
   */
  public increment(): void {
    // Метод .update() принимает функцию-трансформер, возвращающую новое значение
    this.clickCount.update((current) => current + 1);
  }

  /**
   * Инвертирует логический флаг
   */
  public togglePanel(): void {
    this.isPanelOpen.update((isOpen) => !isOpen);
  }

  /**
   * Сбрасывает сигналы к исходным жестко заданным значениям
   */
  public resetAll(): void {
    // Метод .set() полностью заменяет предыдущее значение новым
    this.clickCount.set(0);
    this.isPanelOpen.set(false);
  }
}
```

#### 2. Файл разметки: `simple-counter.html`
```html
<div class="card">
  <p>Счетчик кликов: {{ clickCount() }}</p>
  <p>Статус панели: {{ isPanelOpen() ? 'Активна' : 'Скрыта' }}</p>

  <button (click)="increment()">Увеличить на 1</button>
  <button (click)="togglePanel()">Переключить панель</button>
  <button (click)="resetAll()">Сбросить всё</button>
</div>
```

#### 3. Файл стилей: `simple-counter.css`
```css
.card {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
button {
  margin-right: 8px;
  padding: 6px 12px;
  cursor: pointer;
}
```

---

### Шаблон 2: Иммутабельное обновление массивов (Добавление и удаление)
*   **Назначение:** Добавление элементов в массив без прямой мутации ссылки, что критически важно для корректного срабатывания триггеров реактивности Angular.

#### 1. Файл логики: `task-manager.ts`
```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

export interface TemporaryTask {
  id: string;
  title: string;
}

@Component({
  selector: 'app-task-manager',
  imports: [],
  templateUrl: './task-manager.html',
  styleUrl: './task-manager.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TaskManager {
  // Инициализируем массив объектов
  public readonly tasks = signal<TemporaryTask[]>([]);

  /**
   * Добавляет новую таску в список (Иммутабельно)
   */
  public addTask(title: string): void {
    const cleanTitle = title.trim();
    if (!cleanTitle) return;

    const newTask: TemporaryTask = {
      id: crypto.randomUUID(),
      title: cleanTitle
    };

    // Обновляем массив, создавая новую ссылку в памяти.
    // Прямой вызов tasks().push(newTask) заблокирует реактивность Angular!
    this.tasks.update((currentTasks) => [...currentTasks, newTask]);
  }

  /**
   * Удаляет таску из списка по ID (Иммутабельно)
   */
  public removeTask(id: string): void {
    // Метод .filter() автоматически возвращает новый массив (новую ссылку)
    this.tasks.update((currentTasks) => currentTasks.filter((task) => task.id !== id));
  }
}
```

#### 2. Файл разметки: `task-manager.html`
```html
<div class="manager">
  <div class="input-row">
    <input type="text" #taskInput placeholder="Название таски" class="theme-input" />
    <button (click)="addTask(taskInput.value); taskInput.value = ''" class="action-btn">Добавить</button>
  </div>

  <ul class="task-list">
    @for (task of tasks(); track task.id) {
      <li>
        {{ task.title }} 
        <button (click)="removeTask(task.id)" class="btn-delete">Удалить</button>
      </li>
    }
  </ul>
</div>
```

#### 3. Файл стилей: `task-manager.css`
```css
.manager {
  padding: 16px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
}
.input-row {
  display: flex;
  gap: 8px;
}
.task-list {
  margin-top: 12px;
  padding-left: 20px;
}
.btn-delete {
  margin-left: 12px;
  color: var(--error-text);
  cursor: pointer;
  background: none;
  border: none;
}
```

---

### Шаблон 3: Сложный объект со встроенным кастомным сравнением (Deep Equality)
*   **Назначение:** Описание сигнала, хранящего иерархический объект конфигурации, с защитой от лишних перерисовок DOM при обновлении ссылок на идентичные по структуре данные.

#### 1. Файл логики: `theme-preview.ts`
```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

export interface ComponentThemeConfig {
  primaryColor: string;
  borderRadiusPx: number;
}

@Component({
  selector: 'app-theme-preview',
  imports: [],
  templateUrl: './theme-preview.html',
  styleUrl: './theme-preview.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThemePreview {
  // Инициализируем сигнал со вторым необязательным параметром конфигурации.
  // Передаем кастомную функцию сравнения equal для предотвращения ложных детекций.
  public readonly theme = signal<ComponentThemeConfig>(
    { primaryColor: '#6366f1', borderRadiusPx: 8 },
    {
      equal: (prev, current) => {
        // Выполняем точечное структурное сравнение полей объекта.
        // Если возвращается true, Angular считает, что значение НЕ изменилось,
        // и полностью блокирует уведомление всех зависимых потребителей.
        return (
          prev.primaryColor === current.primaryColor &&
          prev.borderRadiusPx === current.borderRadiusPx
        );
      }
    }
  );

  /**
   * Применяет темную тему
   */
  public applyDarkTheme(): void {
    this.theme.set({
      primaryColor: '#0f1115',
      borderRadiusPx: 12
    });
  }

  /**
   * Симулирует применение идентичных настроек по новой ссылке в памяти
   */
  public applyIdenticalSettings(): void {
    // Ссылка на объект изменилась, но структура идентична.
    // Благодаря кастомной функции equal, Angular проигнорирует этот вызов,
    // и Change Detection в шаблоне компонента запущен не будет.
    this.theme.set({
      primaryColor: this.theme().primaryColor,
      borderRadiusPx: this.theme().borderRadiusPx
    });
  }
}
```

#### 2. Файл разметки: `theme-preview.html`
```html
<div class="preview" [style.color]="theme().primaryColor">
  <p>Текущий радиус скругления: {{ theme().borderRadiusPx }}px</p>
  <button (click)="applyDarkTheme()">Включить темную тему</button>
  <button (click)="applyIdenticalSettings()">Применить те же настройки</button>
</div>
```

#### 3. Файл стилей: `theme-preview.css`
```css
.preview {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
button {
  margin-right: 8px;
  padding: 6px 12px;
  cursor: pointer;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Физика Push-Pull реактивности и граф связей (Producer-Consumer)
В классических реактивных системах на базе RxJS используется модель **Push (проталкивание)**. Когда `BehaviorSubject` меняет значение, он насильно "проталкивает" это значение вниз по цепочке всем подписчикам, заставляя выполнять вычисления прямо в момент изменения данных.

Angular Signals используют кардинально иную модель — **Push-Pull (уведомление + ленивое стягивание)**. Сигналы формируют ориентированный ациклический граф связей (Dependency Graph), где узлы разделены на:
*   **Producers (Издатели):** Любые сигналы, хранящие данные (например, `WritableSignal`).
*   **Consumers (Потребители):** Реактивные контексты, считывающие данные (шаблоны компонентов, эффекты, `computed` вычисления).

Когда вы вызываете `.set()` у издателя, физические расчеты или перерисовка DOM не происходят мгновенно. Издатель лишь отправляет по графу короткое системное уведомление: *«Мой статус изменился, я грязный (dirty)»*. Все связанные потребители помечаются флагом `dirty`. 

И только тогда, когда Angular решает запустить Change Detection (или когда системе реально требуется вывести значение на экран), потребитель выполняет операцию **Pull (стягивание)** — синхронно запрашивает актуальное значение у издателя, вычисляет его и сбрасывает флаг `dirty`. Это позволяет избегать лишних промежуточных вычислений в рантайме.

### 2. Referential Equality (Сравнение по ссылке) vs Custom Equality
По умолчанию Angular проверяет изменение значения сигнала с помощью стандартного JavaScript-метода `Object.is()` (что практически идентично строгому сравнению `===`).

Для примитивных типов данных (числа, строки, логические флаги) это работает идеально: `5 === 5` вернет `true`, и сигнал проигнорирует повторную установку той же цифры.

Однако для сложных структур (массивов, объектов) сравнение идет по ссылке в памяти:
```typescript
Object.is([], []) // Вернет false
```
Если вы вызываете `set()` и передаете новый массив (даже если он пустой или содержит абсолютно те же элементы), `Object.is` вернет `false`. Angular посчитает значение изменившимся и запустит ресурсоемкий Change Detection. Передача кастомной функции сравнения `{ equal: (prev, curr) => boolean }` позволяет настроить глубокое сравнение (Structural Equality), полностью избавляя UI от паразитных циклов перерисовки.

### 3. Пошаговый разбор обновления реактивного графа
Рассмотрим логику выполнения операции `.update()` в `TaskManager`:

1.  **Считывание значения:** Вызов `tasks.update(curr => [...curr, newTask])` считывает предыдущий массив из памяти.
2.  **Генерация нового массива:** С помощью spread-оператора `[...curr]` создается абсолютно новый массив на новом адресе в оперативной памяти.
3.  **Сравнение:** Срабатывает дефолтный валидатор `Object.is(oldArray, newArray)`. Так как ссылки разные, он возвращает `false`.
4.  **Смена статуса:** Значение сигнала перезаписывается. Сигнал `tasks` рассылает по реактивному графу уведомление о том, что он помечен флагом `dirty`.
5.  **Рендеринг:** Шаблон компонента (который является потребителем) видит статус `dirty`, запрашивает свежий массив и перерисовывает только тот фрагмент DOM-дерева, который отвечает за отображение добавленной таски.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Прямая мутация данных внутри сигнала (The Referential Shadow Bug)**
    *   *Симптомы:* Значения внутри объекта или массива меняются (это видно по `console.log`), но шаблон компонента в HTML упрямо не обновляется.
    *   *Физика процесса:* Разработчик напрямую мутирует данные внутри сигнала, нарушая принцип иммутабельности: `this.tasks().push(item)`. Затем он пытается уведомить систему, вызывая `this.tasks.set(this.tasks())`. Angular запускает сравнение `Object.is(oldArray, newArray)`. Так как ссылка на массив не изменилась (мы лишь изменили его содержимое внутри), сравнение возвращает `true`. Angular считает, что данные идентичны, и полностью блокирует запуск Change Detection.
    *   *Решение:* Никогда не мутируйте массивы и объекты напрямую. Всегда пересоздавайте ссылку через spread-оператор или деструктуризацию.

```typescript
// ОШИБКА: Мутация ссылки заблокирует Change Detection Angular
this.tasks().push(newTask);
this.tasks.set(this.tasks());

// ИСПРАВЛЕНИЕ: Иммутабельное обновление с созданием новой ссылки
this.tasks.update(current => [...current, newTask]);
```

*   **Ошибка 2: Использование устаревшего и удаленного метода `.mutate()`**
    *   *Симптомы:* Ошибка компиляции `Property 'mutate' does not exist on type 'WritableSignal'` при попытке обновить сложную структуру данных.
    *   *Физика процесса:* В ранних экспериментальных версиях Signals (Angular 16) существовал метод `.mutate()`, позволяющий вносить изменения в свойства объекта напрямую. Однако на этапе стабилизации API команда Angular полностью удалила этот метод из спецификации фреймворка, так как он нарушал консистентность иммутабельных сравнений и приводил к труднонаходимым багам реактивного графа.
    *   *Решение:* Перепишите все вызовы `.mutate()` на чистый `.update()`.

```typescript
// ОШИБКА: Метод удален из Angular
this.user.mutate(u => u.name = 'New Name');

// ИСПРАВЛЕНИЕ: Переход на иммутабельный .update()
this.user.update(current => ({ ...current, name: 'New Name' }));
```

*   **Ошибка 3: Вызов сигналов с побочными эффектами внутри функций вывода в шаблоне**
    *   *Симптомы:* Консоль забивается миллионами логов, страница зависает или падает с ошибкой `ExpressionChangedAfterItHasBeenCheckedError`.
    *   *Физика процесса:* Разработчик вызывает сигнал внутри тяжелой вспомогательной функции в шаблоне, которая попутно пытается изменить другой сигнал. Это приводит к бесконечной циклической рекурсии вычислений в реактивном графе (Dependency Loop).
    *   *Решение:* Сигналы в шаблонах должны вызываться исключительно на чтение. Любые изменения состояния должны инициироваться строго в ответ на явные действия пользователя (клики, ввод текста) через обработчики событий.