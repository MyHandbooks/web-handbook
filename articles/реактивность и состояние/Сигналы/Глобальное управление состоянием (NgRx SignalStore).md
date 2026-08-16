---
tags: [angular, сигналы, ngrx, архитектура, стейт-менеджмент]
related: ["[[Реактивность с использованием Signals.md]]", "[[Декларативные вычисления (computed).md]]", "[[Асинхронные ресурсы на Сигналах (Resource API, rxResource).md]]"]
status: "completed"
---

# Глобальное управление состоянием (NgRx SignalStore)

## БЫСТРЫЙ СТАРТ

*   **`signalStore`** — официальное декларативное решение для управления состоянием из пакета `@ngrx/signals`. Оно объединяет реактивные Сигналы, ленивые вычисления и асинхронные методы в модульный сервис без лишнего шаблонного кода (actions, reducers, effects).
*   **Модульная архитектура через функции-расширения:**
    *   `withState(initialState)` — объявляет сигналы состояния (state slices).
    *   `withComputed((store) => ({ ... }))` — добавляет вычисляемые сигналы (`computed`).
    *   `withMethods((store) => ({ ... }))` — объявляет синхронные и асинхронные методы изменения состояния (`patchState`, `rxMethod`).
    *   `withHooks({ onInit, onDestroy })` — задает жизненный цикл хранилища.
*   **Используйте для:** создания глобальных и компонентных хранилищ состояния любого масштаба в современных Angular-приложениях.
*   **Не используйте для:** примитивного состояния одного поля внутри изолированного компонента (для этого достаточно локального `signal()`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Декларативное хранилище задач (`TasksStore`) с `patchState` и `rxMethod`
*   **Назначение:** Полнофункциональный сервис состояния на базе `signalStore`: хранение списка задач, фильтрация через `computed`, асинхронная загрузка через `rxMethod` и иммутабельные обновления через `patchState`.

#### 1. Файл типов и хранилища: `tasks.store.ts`
```typescript
import { signalStore, withState, withComputed, withMethods, withHooks, patchState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { pipe, switchMap, tap, catchError, of } from 'rxjs';

export interface TaskItem {
  id: string;
  title: string;
  isCompleted: boolean;
}

export type TaskFilter = 'all' | 'pending' | 'completed';

export interface TasksState {
  tasks: TaskItem[];
  filter: TaskFilter;
  isLoading: boolean;
  error: string | null;
}

const initialTasksState: TasksState = {
  tasks: [],
  filter: 'all',
  isLoading: false,
  error: null
};

// Экспортируем полностью типизированный injectable-стор
export const TasksStore = signalStore(
  { providedIn: 'root' }, // Регистрируем как глобальный синглтон
  // 1. Описываем сигнальные срезы состояния (state slices)
  withState(initialTasksState),

  // 2. Декларативно вычисляем производные сигналы
  withComputed(({ tasks, filter }) => ({
    // Отфильтрованный список задач
    filteredTasks: computed(() => {
      const currentFilter = filter();
      const allTasks = tasks();

      if (currentFilter === 'pending') return allTasks.filter(t => !t.isCompleted);
      if (currentFilter === 'completed') return allTasks.filter(t => t.isCompleted);
      return allTasks;
    }),
    // Количество незавершенных задач
    pendingCount: computed(() => tasks().filter(t => !t.isCompleted).length)
  })),

  // 3. Объявляем методы изменения состояния
  withMethods((store, http = inject(HttpClient)) => ({
    // Синхронный метод изменения фильтра
    setFilter(filter: TaskFilter): void {
      patchState(store, { filter });
    },

    // Синхронный метод переключения статуса задачи
    toggleTask(taskId: string): void {
      patchState(store, (state) => ({
        tasks: state.tasks.map(t => 
          t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t
        )
      }));
    },

    // Асинхронный реактивный метод загрузки данных с бэкенда через RxJS-пайплайн
    loadTasks: rxMethod<void>(
      pipe(
        tap(() => patchState(store, { isLoading: true, error: null })),
        switchMap(() => 
          http.get<TaskItem[]>('https://api.enterprise-service.com/v1/tasks').pipe(
            tap((tasks) => patchState(store, { tasks, isLoading: false })),
            catchError((err: Error) => {
              patchState(store, { error: err.message, isLoading: false });
              return of([]);
            })
          )
        )
      )
    )
  })),

  // 4. Запускаем автоматическую загрузку данных при инициализации стора
  withHooks({
    onInit(store) {
      store.loadTasks();
    }
  })
);
```

---

### Шаблон 2: Подключение и использование `TasksStore` в компоненте
*   **Назначение:** Использование `TasksStore` в Standalone-компоненте со стратегией `OnPush`.

#### 1. Файл логики компонента: `tasks-view.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { TasksStore, TaskFilter } from './tasks.store';

@Component({
  selector: 'app-tasks-view',
  templateUrl: './tasks-view.html',
  styleUrl: './tasks-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TasksView {
  // Внедряем хранилище через стандартный DI
  public readonly store = inject(TasksStore);

  public onFilterChange(filter: TaskFilter): void {
    this.store.setFilter(filter);
  }

  public onToggle(id: string): void {
    this.store.toggleTask(id);
  }
}
```

#### 2. Файл разметки компонента: `tasks-view.html`
```html
<div class="tasks-card">
  <div class="header">
    <h3>Список задач (Осталось: {{ store.pendingCount() }})</h3>
    
    <div class="filter-buttons">
      <button 
        type="button" 
        [class.active]="store.filter() === 'all'" 
        (click)="onFilterChange('all')"
      >Все</button>
      <button 
        type="button" 
        [class.active]="store.filter() === 'pending'" 
        (click)="onFilterChange('pending')"
      >В работе</button>
      <button 
        type="button" 
        [class.active]="store.filter() === 'completed'" 
        (click)="onFilterChange('completed')"
      >Завершенные</button>
    </div>
  </div>

  @if (store.isLoading()) {
    <p class="loading">Синхронизация задач с облаком...</p>
  } @else if (store.error(); as errorMsg) {
    <p class="error">Ошибка: {{ errorMsg }}</p>
  } @else {
    <ul class="task-list">
      @for (task of store.filteredTasks(); track task.id) {
        <li class="task-item" [class.done]="task.isCompleted">
          <input 
            type="checkbox" 
            [checked]="task.isCompleted" 
            (change)="onToggle(task.id)"
          />
          <span>{{ task.title }}</span>
        </li>
      } @empty {
        <li class="empty">Задач нет</li>
      }
    </ul>
  }
</div>
```

#### 3. Файл стилей компонента: `tasks-view.css`
```css
.tasks-card {
  max-width: 480px;
  padding: 20px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-buttons {
  display: flex;
  gap: 6px;
}

.filter-buttons button {
  padding: 4px 10px;
  background: none;
  border: 1px solid var(--border);
  color: var(--text-normal);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}

.filter-buttons button.active {
  background-color: var(--accent);
  border-color: var(--accent);
  color: #ffffff;
}

.task-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
}

.task-item.done span {
  text-decoration: line-through;
  opacity: 0.6;
}

.loading, .error, .empty {
  font-size: 0.9rem;
  color: var(--text-muted);
  text-align: center;
  padding: 12px 0;
}

.error {
  color: var(--error-text);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурное преимущество SignalStore над классическим NgRx Store
Классический Redux-подход в NgRx (Store + Reducers + Actions + Effects) создавал огромное количество шаблонного кода: для каждого действия требовалось объявить Action, добавить ветку в Reducer, описать Selector и создать Effect для асинхронного вызова.

`NgRx SignalStore` кардинально меняет подход:
1.  **Декларативность и отсутствие бойлерплейта:** Состояние, селекторы и методы собираются в один легковесный файл через цепочку `withState()`, `withComputed()`, `withMethods()`.
2.  **Нативная поддержка Сигналов:** Каждое свойство состояния автоматически экспортируется как сигнал только для чтения (`DeepSignal`).
3.  **Гибкая область видимости:** Стор можно объявить как глобальный синглтон (`{ providedIn: 'root' }`), либо изолировать на уровне компонента через `providers: [TasksStore]`, гарантируя автоматическую очистку памяти при уничтожении компонента.

```text
Классический Redux:
  [UI Component] ──dispatch(Action)──► [Reducer] ──► [Store State] ──Select──► [UI]
         │
         └─────────► [Effects] ──(API Call)──► Action ──► [Reducer]

NgRx SignalStore:
  [UI Component] ──store.setFilter()──► [patchState] ──(Сигнальный граф)──► [UI]
         │
         └─────────store.loadTasks()──► (API Call) ──► [patchState]
```

### 2. Принцип работы `patchState()` и иммутабельность
Функция `patchState(store, ...updaters)` — единственный легальный способ обновления состояния в SignalStore.

Она поддерживает две формы вызова:
*   **Объектная форма:** `patchState(store, { filter: 'completed' })` — выполняет быстрое слияние полей первого уровня (Shallow Merge).
*   **Функциональная форма:** `patchState(store, (state) => ({ tasks: [...state.tasks, newTask] }))` — вычисляет новое состояние на основе предыдущего, гарантируя защиту от гонок состояния при последовательных обновлениях.

### 3. Интеграция RxJS через `rxMethod`
Частая задача в приложениях — управление сложными асинхронными процессами (дебаунс поиска, отмена запросов при смене ID). 

Утилита `rxMethod<T>()` из `@ngrx/signals/rxjs-interop` позволяет встроить RxJS-пайплайн прямо в метод стора:
*   `rxMethod` может принимать на вход как статические значения `store.loadById('123')`, так и реактивные сигналы `store.loadById(mySignal)` или потоки `Observable`.
*   При передаче сигнала `rxMethod` автоматически подписывается на его изменения и перезапускает внутренний пайплайн при каждом обновлении источника.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Прямая мутация массивов внутри `patchState`**
    *   *Симптомы:* Состояние внутри стора меняется, но компоненты в шаблоне не обновляются.
    *   *Физика процесса:* Разработчик мутирует массив `state.tasks.push(newTask)` и возвращает тот же массив. Ссылка в памяти не изменилась, поэтому Angular считает, что сигнал не обновился.
    *   *Решение:* Всегда возвращайте новый массив через spread-оператор `[...state.tasks, newTask]`.

*   **Ошибка 2: Чтение сигналов стора внутри `withComputed` без вызова функции `()`**
    *   *Симптомы:* Ошибка компиляции: `Operator '+' cannot be applied to types 'Signal<number>' and 'number'`.
    *   *Физика процесса:* Свойства стора, переданные в аргументы `withComputed(({ tasks, filter }) => ...)`, являются функциями-сигналами. Чтобы получить их значение, их необходимо вызвать со скобками `tasks()`.
    *   *Решение:* Всегда считывайте сигналы стора через круглые скобки `()` внутри `computed`.

*   **Ошибка 3: Утечка памяти при использовании компонентного стора без отписки в rxMethod**
    *   *Симптомы:* Асинхронные запросы продолжают выполняться в фоне после закрытия модального окна или ухода со страницы.
    *   *Физика процесса:* `rxMethod` автоматически завершает свои внутренние подписки при уничтожении инжектора, в котором был создан стор. Но если стор объявлен глобально (`providedIn: 'root'`), его инжектор живет вечно.
    *   *Решение:* Если состояние нужно только на время жизни экрана, регистрируйте стор в массиве `providers` конкретного компонента.
