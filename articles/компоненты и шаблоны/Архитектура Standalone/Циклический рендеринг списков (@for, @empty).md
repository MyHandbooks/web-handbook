---
tags: [angular, компоненты-и-шаблоны, архитектура]
related: ["[[Базовая декларативная структура Standalone-компонента.md]]", "[[Условные блоки в шаблоне (@if, @else).md]]"]
status: "completed"
---

# Циклический рендеринг списков (@for, @empty)

## БЫСТРЫЙ СТАРТ

*   **@for / @empty** — это встроенный управляющий синтаксис шаблонов Angular (Control Flow) для циклического обхода коллекций, пришедший на смену тяжеловесной структурной директиве `*ngFor`.
*   **Обязательное отслеживание (track):** Выражение `track` теперь строго обязательно на этапе компиляции. Проект не соберется, если разработчик попытается запустить цикл без указания уникального ключа идентификации элементов. Это полностью исключает случайные проблемы с производительностью рендеринга.
*   **Декларативная заглушка (@empty):** Встроенный блок `@empty` автоматически рендерится в DOM, когда переданный массив пуст, равен `null` или `undefined`, устраняя необходимость писать внешние условные обертки `@if (list.length === 0)`.
*   **Правила использования:**
    *   **Используйте:** Для отрисовки динамических списков, таблиц, сеток карточек и любых повторяющихся коллекций данных, у которых есть уникальные ключи (идентификаторы).
    *   **Не используйте:** Для отрисовки статической верстки, где количество элементов неизменно. Пишите обычный развернутый HTML, чтобы не нагружать рантайм Angular лишней работой.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Цикл со служебными контекстными переменными и заглушкой
*   **Назначение:** Отрисовка списка объектов `TargetPayload` с использованием встроенных контекстных переменных для стилизации четных строк, вывода порядковых номеров и обработки пустого состояния.

#### 1. Файл логики: `loop-basic.ts`
```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

export interface TargetPayload {
  readonly uniqueId: string;
  readonly displayTitle: string;
}

@Component({
  selector: 'app-loop-basic',
  imports: [], // Встроенный Control Flow не требует импорта CommonModule или NgFor
  templateUrl: './loop-basic.html',
  styleUrl: './loop-basic.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoopBasic { // Имя класса не содержит суффикса Component
  // Инициализация реактивного списка данных
  readonly items = signal<TargetPayload[]>([]);

  // Заполнение списка данными
  loadResources(): void {
    this.items.set([
      { uniqueId: 'RES-01', displayTitle: 'Процессорный модуль ядра' },
      { uniqueId: 'RES-02', displayTitle: 'Шина ввода-вывода периферии' },
      { uniqueId: 'RES-03', displayTitle: 'Стек виртуальной памяти L3' }
    ]);
  }

  // Сброс списка для демонстрации работы блока @empty
  clearResources(): void {
    this.items.set([]);
  }
}
```

#### 2. Файл разметки: `loop-basic.html`
```html
<div class="list-wrapper">
  <h2>Список системных ресурсов</h2>

  <ul class="resource-list">
    <!-- 
      Инициализация встроенного цикла:
      1. item - текущий элемент массива
      2. track item.uniqueId - связывание DOM-узла с уникальным ключом для оптимизации перерисовок
      3. $index - локальная контекстная переменная (индекс текущего элемента с 0)
      4. $even - булевый флаг, возвращающий true для четных элементов (0, 2, 4...)
    -->
    @for (item of items(); track item.uniqueId; let idx = $index; let isEven = $even) {
      <li class="list-item" [class.highlighted]="isEven">
        <!-- Вывод порядкового номера элемента (начиная с 1) и его названия -->
        <span class="badge">{{ idx + 1 }}</span>
        <span class="title">{{ item.displayTitle }}</span>
      </li>
    } @empty {
      <!-- Блок автоматически отрисуется, если массив items() пуст -->
      <li class="empty-state">
        <p>Доступные ресурсы отсутствуют в конфигурации.</p>
      </li>
    }
  </ul>

  <div class="actions">
    <button (click)="loadResources()">Загрузить ресурсы</button>
    <button (click)="clearResources()">Очистить список</button>
  </div>
</div>
```

#### 3. Файл стилей: `loop-basic.css`
```css
.list-wrapper {
  padding: 20px;
}

.resource-list {
  list-style: none;
  padding: 0;
}

.list-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
}

.list-item.highlighted {
  background-color: var(--bg-secondary);
}

.badge {
  background-color: var(--accent);
  color: white;
  border-radius: 4px;
  padding: 2px 6px;
  margin-right: 12px;
  font-size: 0.8rem;
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border);
}

.actions {
  display: flex;
  gap: 10px;
  margin-top: 15px;
}
```

---

### Шаблон 2: Оптимизированное иммутабельное обновление сигнального списка
*   **Назначение:** Динамическое изменение списка (добавление, удаление, сортировка) с использованием иммутабельных методов и корректным отслеживанием элементов по бизнес-идентификаторам.

#### 1. Файл логики: `loop-immutable.ts`
```typescript
import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

export interface DataStateItem {
  readonly id: string;
  readonly name: string;
}

@Component({
  selector: 'app-loop-immutable',
  imports: [],
  templateUrl: './loop-immutable.html',
  styleUrl: './loop-immutable.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoopImmutable {
  // Список инициализируется дефолтными элементами
  readonly items = signal<DataStateItem[]>([
    { id: '1', name: 'Модуль Альфа' },
    { id: '2', name: 'Модуль Бета' }
  ]);

  // Добавление нового элемента с созданием новой ссылки на массив (иммутабельно)
  addNewItem(): void {
    const nextId = (Math.random() * 1000).toFixed(0);
    const newItem: DataStateItem = { id: nextId, name: `Модуль Группа-${nextId}` };

    // Обновляем сигнал, добавляя новый элемент в конец массива через spread-оператор
    this.items.update(currentList => [...currentList, newItem]);
  }

  // Удаление элемента по id с сохранением иммутабельности данных
  removeItem(targetId: string): void {
    // Метод filter возвращает совершенно новую ссылку на массив без искомого элемента
    this.items.update(currentList => currentList.filter(item => item.id !== targetId));
  }
}
```

#### 2. Файл разметки: `loop-immutable.html`
```html
<div class="immutable-container">
  <div class="header">
    <h3>Управление элементами (Всего: {{ items().length }})</h3>
    <button (click)="addNewItem()">Добавить элемент</button>
  </div>

  <div class="grid-list">
    <!-- 
      Использование уникального бизнес-ключа 'id' гарантирует, что 
      при сортировке или удалении Angular просто переместит DOM-узлы, 
      вместо их полного уничтожения и пересоздания.
    -->
    @for (item of items(); track item.id) {
      <div class="grid-card">
        <span>{{ item.name }}</span>
        <button class="delete-btn" (click)="removeItem(item.id)">Удалить</button>
      </div>
    } @empty {
      <div class="no-cards">Нет активных карточек.</div>
    }
  </div>
</div>
```

#### 3. Файл стилей: `loop-immutable.css`
```css
.immutable-container {
  padding: 16px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.grid-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.grid-card {
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.delete-btn {
  background: none;
  border: 1px solid var(--error-text);
  color: var(--error-text);
  border-radius: 4px;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 0.75rem;
}

.no-cards {
  grid-column: 1 / -1;
  text-align: center;
  padding: 30px;
  border: 1.5px dashed var(--border);
  border-radius: 8px;
  color: var(--text-muted);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Алгоритм сверки (Diffing) и производительность рендеринга V8
В старом синтаксисе `*ngFor` отслеживание элементов по умолчанию происходило по объектной ссылке (by object identity). Это приводило к следующей проблеме:
1.  Приложение запрашивает массив объектов с бэкенда.
2.  Бэкенд возвращает те же самые данные, но парсер JSON создает в оперативной памяти новые ссылки на объекты.
3.  Angular видит, что ссылки изменились, уничтожает все текущие DOM-элементы списка из дерева и создает их заново.
4.  В результате происходили падения FPS, сброс фокусов с инпутов, обнуление выделений текста и перезапуск CSS-анимаций. Чтобы этого избежать, приходилось писать отдельную функцию `trackBy`.

В современном синтаксисе `@for` указание ключа отслеживания принудительно зашито в компилятор. Когда вы указываете `track item.id`:
*   Механизм сверки Ivy (Diffing Algorithm) связывает каждый сгенерированный DOM-узел с конкретным строковым или числовым ключом `id`.
*   При обновлении массива, даже если ссылки на объекты полностью обновились, Angular сравнивает исключительно значения ключей.
*   Если ключи совпали, Angular оставляет DOM-узлы нетронутыми, лишь точечно обновляя изменившиеся текстовые поля или атрибуты.
*   Если порядок элементов изменился, Angular выполняет быструю операцию перемещения узлов в DOM (`Node.insertBefore()`), избегая тяжелого процесса уничтожения и воссоздания структуры элементов.

### 2. Контекстные переменные цикла
Внутри области видимости блока `@for` рантайм Angular предоставляет доступ к набору локальных неявных переменных, которые обновляются автоматически во время циклов Change Detection:

| Переменная | Тип данных | Назначение |
| :--- | :--- | :--- |
| `$index` | `number` | Индекс текущего элемента в коллекции (начинается с `0`). |
| `$count` | `number` | Общее количество элементов в текущем массиве. |
| `$first` | `boolean` | Возвращает `true`, если элемент является самым первым в цикле. |
| `$last` | `boolean` | Возвращает `true`, если элемент является самым последним в цикле. |
| `$even` | `boolean` | Возвращает `true` для всех четных индексов элементов (`0, 2, 4...`). |
| `$odd` | `boolean` | Возвращает `true` для всех нечетных индексов элементов (`1, 3, 5...`). |

Эти переменные компилируются во внутренние локальные переменные функции рендеринга Ivy и не создают дополнительной нагрузки на обход дерева инжекторов, работая со скоростью нативного JS.

### 3. Пошаговый разбор жизненного цикла рендеринга цикла
При первой отрисовке `LoopBasic`:
1.  **Анализ источника:** Считывается значение сигнала `items()`. Если длина массива равна 0, компилятор сразу перенаправляет поток рендеринга в ветку `@empty`.
2.  **Генерация TView / LView:** Если данные есть, создается корневой шаблон цикла. Для каждого элемента массива генерируется локальное дочернее представление (Embedded View).
3.  **Кэширование ключей track:** Для каждого элемента рантайм вычисляет переданное выражение `track` и сохраняет соответствие ключа и индекса элемента в системном массиве отслеживания.
4.  **Событие добавления данных:** При изменении массива Angular сверяет старый массив ключей с новым, вычисляет разницу (diff) и применяет точечные мутации к DOM.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Использование индекса массива (`$index`) в качестве ключа `track` для динамических списков**
    *   *Симптомы:* Баги при вводе текста в input-поля списка; при удалении карточки из середины списка визуально удаляется последний элемент, но с данными удаленного; ломаются анимации удаления.
    *   *Физика процесса:* Если указать `track $index`, вы говорите Angular: «Привяжи DOM-узлы к их физическому порядку». При удалении элемента из середины массива индексы всех последующих элементов сдвигаются. Angular считает, что изменились данные внутри существующих индексов, а не сами элементы. Он оставляет DOM-узлы на месте и просто перезаписывает их свойства, разрушая внутреннее состояние дочерних компонентов (например, фокус или локальный текст в инпутах).
    *   *Решение:* Всегда отслеживайте элементы по их уникальным бизнес-идентификаторам (id, uuid), которые остаются неизменными на протяжении всей жизни объекта.

```typescript
// ОШИБКА: Использование индекса в качестве трекера для динамического списка
@Component({
  selector: 'app-faulty-loop',
  templateUrl: './faulty-loop.html',
  styleUrl: './faulty-loop.css'
})
export class FaultyLoop { ... }
// В шаблоне: @for (user of users(); track $index) { <input [(ngModel)]="user.comment"> }

// ИСПРАВЛЕНИЕ: Отслеживание по уникальному ID сущности
@Component({
  selector: 'app-fixed-loop',
  templateUrl: './fixed-loop.html',
  styleUrl: './fixed-loop.css'
})
export class FixedLoop { ... }
// В шаблоне: @for (user of users(); track user.id) { <input [(ngModel)]="user.comment"> }
```

*   **Ошибка 2: Отслеживание по ссылке на весь объект (`track item`)**
    *   *Симптомы:* При каждом обновлении данных с сервера (даже без изменений самих полей) полностью перерисовывается весь список, приводя к миганию экрана и потере фокуса.
    *   *Физика процесса:* Если указать `track item` при работе со сторонним API, Angular будет использовать сравнение по ссылке. Так как JSON-парсер при каждом запросе создает в куче новые объекты, ссылки никогда не совпадут, что сделает алгоритм оптимизации бесполезным.
    *   *Решение:* Использовать примитивное уникальное поле внутри объекта в качестве ключа.

```typescript
// ОШИБКА: Отслеживание по объекту-ссылке
// @for (item of dataList(); track item) { ... }

// ИСПРАВЛЕНИЕ: Отслеживание по уникальному строковому/числовому свойству
// @for (item of dataList(); track item.uniqueIdentifier) { ... }
```

*   **Ошибка 3: Мутация оригинального массива вместо создания новой ссылки (нарушение OnPush)**
    *   *Симптомы:* Список в шаблоне не обновляется при вызове методов `.push()` или `.splice()`, хотя данные в массиве физически изменились.
    *   *Физика процесса:* При использовании `ChangeDetectionStrategy.OnPush` Angular проверяет изменения только в том случае, если обновилась сама ссылка на массив (сравнение `current !== previous`). Методы `.push()`, `.unshift()`, `.splice()` мутируют массив по старой ссылке. Компилятор не видит изменений и пропускает рендеринг цикла.
    *   *Решение:* Работать со списком исключительно иммутабельно, возвращая новый массив.

```typescript
// ОШИБКА: Мутация массива по старой ссылке (OnPush проигнорирует это изменение)
modifyList(): void {
  const current = this.items();
  current.push({ id: '99', name: 'Ошибка' });
  this.items.set(current); // Ссылка на массив осталась прежней!
}

// ИСПРАВЛЕНИЕ: Создание новой ссылки на массив (spread-оператор)
modifyListCorrectly(): void {
  this.items.update(current => [...current, { id: '99', name: 'Успех' }]);
}
```