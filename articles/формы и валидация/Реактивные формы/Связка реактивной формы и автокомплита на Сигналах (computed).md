---
tags: [angular, формы-и-валидация, реактивные-формы]
related: ["Объявление структуры формы через FormBuilder.md", "Реактивное отслеживание ввода (valueChanges).md"]
status: "completed"
---

# Связка реактивной формы и автокомплита на Сигналах (computed)

## БЫСТРЫЙ СТАРТ

*   **Автокомплит на Сигналах** — это архитектурный шаблон, объединяющий классический асинхронный ввод из реактивных форм (`valueChanges`) и преимущества мемоизации реактивного графа Сигналов (`computed`). Он позволяет декларативно фильтровать списки подсказок на стороне клиента с максимальной производительностью.
*   **Реактивный мост (`toSignal`):** Интеграция выполняется с помощью утилиты `toSignal` из пакета `@angular/core/rxjs-interop`. Она превращает бесконечный RxJS-поток изменений инпута в синхронный Сигнал чтения, который затем бесшовно связывается с вычисляемыми свойствами `computed`.
*   **Правила использования:**
    *   **Используйте:** Для интерактивных полей поиска, селекторов тегов, систем фильтрации и выпадающих списков с подсказками (autocomplete), где справочные данные хранятся локально в памяти или кэшированы на клиенте.
    *   **Не используйте:** Если для каждого символа требуется обязательный сетевой запрос на бэкенд с сложной пагинацией — в таких сценариях лучше использовать классический RxJS-конвейер со `switchMap` без конвертации в Сигналы.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Базовый текстовый автокомплит со словарем в памяти
*   **Назначение:** Описание структуры класса `AutocompleteForm`, который отслеживает ввод в поле формы, сглаживает дребезг на 150 мс и мгновенно вычисляет список подходящих языков программирования через `computed`.

#### 1. Файл логики: `autocomplete-form.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
  selector: 'app-autocomplete-form',
  imports: [ReactiveFormsModule], // Модуль реактивных форм. standalone: true активен по умолчанию с v19
  templateUrl: './autocomplete-form.html',
  styleUrl: './autocomplete-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AutocompleteForm { // Класс объявлен в новом стиле v20 без суффикса Component
  private readonly fb = inject(NonNullableFormBuilder);

  // 1. Исходный реактивный словарь-источник, хранящийся в Сигнале
  readonly technologyDictionary = signal<string[]>([
    'TypeScript', 'JavaScript', 'Angular', 'RxJS', 'HTML5', 'CSS3', 'Node.js', 'SCSS', 'Svelte', 'Vue'
  ]);

  // Объявление модели формы
  readonly searchForm = this.fb.group({
    searchQuery: ['']
  });

  // 2. Преобразование потока valueChanges в Сигнал query.
  // Применяем debounceTime во вспомогательном пайпе перед конвертацией, чтобы избежать частых перерисовок.
  readonly query = toSignal(
    this.searchForm.controls.searchQuery.valueChanges.pipe(
      debounceTime(150),
      distinctUntilChanged()
    ),
    { initialValue: '' } // Обязательно указываем дефолтное значение для исключения undefined из типов
  );

  // 3. Мемоизированный расчет списка подходящих вариантов.
  // Функция автоматически отслеживает изменения в сигналах query() и technologyDictionary().
  readonly filteredSuggestions = computed(() => {
    const rawQuery = this.query().toLowerCase().trim();
    
    // Если поле пустое — подсказки не отображаются
    if (!rawQuery) {
      return [];
    }

    // Выполняем быструю фильтрацию массива на клиенте
    return this.technologyDictionary().filter(item => 
      item.toLowerCase().includes(rawQuery)
    );
  });

  // Метод выбора элемента из списка подсказок
  selectSuggestion(value: string): void {
    // Обновляем значение в форме с отключением генерации повторных событий во избежание рекурсии
    this.searchForm.controls.searchQuery.setValue(value, { emitEvent: false });
    // Сбрасываем текущую поисковую строку в сигнале query (путем ручной подмены значения в форме или сброса)
    // Так как emitEvent: false не сгенерировал событие, мы можем применить очистку подсказок принудительно
  }
}
```

#### 2. Файл разметки: `autocomplete-form.html`
```html
<div class="autocomplete-box">
  <form [formGroup]="searchForm">
    <div class="input-wrapper">
      <label for="search">Поиск технологии:</label>
      <input id="search" type="text" formControlName="searchQuery" placeholder="Начните вводить название..." autocomplete="off" class="search-input">
    </div>
  </form>

  <!-- Отображаем блок подсказок, только если есть подходящие результаты -->
  @if (filteredSuggestions().length > 0) {
    <ul class="suggestions-dropdown">
      @for (suggestion of filteredSuggestions(); track suggestion) {
        <li class="suggestion-item" (click)="selectSuggestion(suggestion)">
          {{ suggestion }}
        </li>
      }
    </ul>
  }
</div>
```

#### 3. Файл стилей: `autocomplete-form.css`
```css
.autocomplete-box { max-width: 400px; padding: 20px; border: 1px solid var(--border); border-radius: 8px; position: relative; }
.input-wrapper { display: flex; flex-direction: column; gap: 6px; }
.input-wrapper label { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); }
.search-input { padding: 10px 12px; background-color: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-normal); outline: none; }
.search-input:focus { border-color: var(--accent); }
.suggestions-dropdown { list-style: none; padding: 0; margin: 4px 0 0; border: 1px solid var(--border); border-radius: 6px; background-color: var(--bg-secondary); position: absolute; width: calc(100% - 40px); z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.2); max-height: 200px; overflow-y: auto; }
.suggestion-item { padding: 10px 12px; cursor: pointer; font-size: 0.9rem; color: var(--text-normal); transition: background-color 0.15s; }
.suggestion-item:hover { background-color: var(--nav-active); color: var(--accent); }
```

---

### Шаблон 2: Продвинутый множественный выбор тегов (Multi-select)
*   **Назначение:** Описание структуры класса `MultiSelectForm` для реализации выбора тегов. Выбранные теги сохраняются в сигнальный массив-список и автоматически исключаются из списка доступных подсказок автокомплита.

#### 1. Файл логики: `multi-select-form.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';

@Component({
  selector: 'app-multi-select-form',
  imports: [ReactiveFormsModule],
  templateUrl: './multi-select-form.html',
  styleUrl: './multi-select-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MultiSelectForm { // Чистое имя класса по современному стандарту v20
  private readonly fb = inject(NonNullableFormBuilder);

  // Доступная база тегов
  readonly allTags = signal<string[]>(['CSS', 'Sass', 'Webpack', 'Vite', 'Docker', 'Git', 'CI/CD']);
  // Сигнал для накопления выбранных пользователем тегов
  readonly selectedTags = signal<string[]>([]);

  readonly tagForm = this.fb.group({
    tagInput: ['']
  });

  // Чтение ввода в Сигнал с задержкой в 100 мс
  readonly query = toSignal(
    this.tagForm.controls.tagInput.valueChanges.pipe(
      debounceTime(100),
      distinctUntilChanged()
    ),
    { initialValue: '' }
  );

  // Фильтрация подсказок. Исключаем из результатов те теги, которые уже были выбраны пользователем
  readonly availableSuggestions = computed(() => {
    const rawQuery = this.query().toLowerCase().trim();
    if (!rawQuery) {
      return [];
    }

    return this.allTags()
      .filter(tag => !this.selectedTags().includes(tag)) // Исключаем уже выбранные
      .filter(tag => tag.toLowerCase().includes(rawQuery)); // Фильтруем по поисковой строке
  });

  // Метод добавления тега в выбранные
  addTag(tag: string): void {
    // Иммутабельно обновляем список выбранных тегов
    this.selectedTags.update(current => [...current, tag]);
    // Очищаем инпут ввода
    this.tagForm.controls.tagInput.setValue('');
  }

  // Метод удаления тега из выбранных
  removeTag(tagToRemove: string): void {
    this.selectedTags.update(current => current.filter(tag => tag !== tagToRemove));
  }
}
```

#### 2. Файл разметки: `multi-select-form.html`
```html
<div class="multi-select-box">
  <h3>Выбор стека инструментов</h3>

  <!-- Контейнер для отображения выбранных тегов (Chips) -->
  <div class="chips-container">
    @for (tag of selectedTags(); track tag) {
      <span class="chip">
        {{ tag }}
        <button class="btn-remove" (click)="removeTag(tag)">×</button>
      </span>
    }
  </div>

  <form [formGroup]="tagForm">
    <div class="input-wrapper">
      <input type="text" formControlName="tagInput" placeholder="Введите название навыка..." autocomplete="off" class="tag-input">
    </div>
  </form>

  <!-- Выпадающий список подсказок -->
  @if (availableSuggestions().length > 0) {
    <ul class="suggestions-dropdown">
      @for (suggestion of availableSuggestions(); track suggestion) {
        <li class="suggestion-item" (click)="addTag(suggestion)">
          {{ suggestion }}
        </li>
      }
    </ul>
  }
</div>
```

#### 3. Файл стилей: `multi-select-form.css`
```css
.multi-select-box { max-width: 450px; padding: 20px; border: 1px solid var(--border); border-radius: 8px; position: relative; }
.chips-container { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.chip { display: inline-flex; align-items: center; gap: 6px; background-color: var(--accent); color: white; padding: 4px 10px; border-radius: 16px; font-size: 0.8rem; font-weight: 600; }
.btn-remove { background: none; border: none; color: white; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0; }
.input-wrapper { display: flex; flex-direction: column; }
.tag-input { padding: 8px 12px; background-color: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-normal); outline: none; }
.tag-input:focus { border-color: var(--accent); }
.suggestions-dropdown { list-style: none; padding: 0; margin: 4px 0 0; border: 1px solid var(--border); border-radius: 6px; background-color: var(--bg-secondary); position: absolute; width: calc(100% - 40px); z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,0.2); max-height: 150px; overflow-y: auto; }
.suggestion-item { padding: 8px 12px; cursor: pointer; font-size: 0.85rem; color: var(--text-normal); transition: background-color 0.15s; }
.suggestion-item:hover { background-color: var(--nav-active); color: var(--accent); }
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Интеграция RxJS и Сигналов через `toSignal`
Инструмент `toSignal` из библиотеки `@angular/core/rxjs-interop` выполняет роль моста между асинхронным событийно-ориентированным миром RxJS и синхронной декларативной архитектурой Сигналов:
*   **Автоматическое управление подпиской:** При вызове `toSignal(observable)` Angular автоматически подписывается на переданный поток. Самое главное — Angular самостоятельно уничтожит эту подписку при удалении компонента из дерева рендеринга (в момент разрушения контекста инжекции `InjectionContext`), исключая любые риски утечек оперативной памяти без ручного написания `takeUntil` или `unsubscribe()`.
*   **Синхронность:** Сигналы всегда должны иметь актуальное значение здесь и сейчас. Поскольку обсерваблы по своей природе ленивые и могут не выплюнуть значение мгновенно при подписке, опция `{ initialValue: '' }` является обязательной для сохранения строгой типобезопасности. Она гарантирует, что сигнал сразу вернет дефолтное значение, не возвращая опасный `undefined`.

### 2. Преимущества `computed()` фильтрации над подписками
Классический подход к фильтрации требовал ручной подписки на изменения инпута и императивного проталкивания данных в локальный массив результатов:
`this.control.valueChanges.subscribe(q => this.results = filter(q))`.

Использование `computed()` кардинально меняет физику процесса:
1.  **Декларативность:** Вы просто описываете *правило расчета*: «результат — это исходный массив, очищенный от выбранных тегов и отфильтрованный по строке запроса».
2.  **Эффективная мемоизация (кэширование):** Сигнал `computed` вычисляет результат лениво (lazy evaluation). Если ни значение поискового запроса `query()`, ни список выбранных тегов `selectedTags()` не менялись, Angular мгновенно вернет ранее рассчитанный результат из кэша, вообще не запуская выполнение фильтрации. Это предотвращает бесполезную нагрузку на процессор при проверках изменений.

### 3. Пошаговый разбор фаз прохождения данных при автокомплите
Когда пользователь вводит букву «A» в инпут `AutocompleteForm`:
1.  **Обновление реактивной формы:** Значение контрола `searchQuery` изменяется.
2.  **Фильтрация в RxJS-пайпе:** Поток `valueChanges` получает букву «А», задерживает ее прохождение на 150 мс (`debounceTime`) для подавления быстрого дребезга клавиатуры.
3.  **Обновление сигнала-моста:** `toSignal` принимает значение и обновляет реактивный узел `query()`.
4.  **Каскадный перерасчет графа:** Обновление `query()` автоматически переводит зависимый сигнал `filteredSuggestions()` в статус `dirty` (требующий перерасчета).
5.  **Рендеринг изменений:** При следующем цикле проверки изменений Angular считывает новое значение `filteredSuggestions()`, рассчитывает его по декларативной формуле и отрисовывает обновленный блок `@if` в HTML.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Вызов `toSignal` внутри реактивного контекста (например, внутри `computed` или `effect`)**
    *   *Симптомы:* Критическая ошибка компиляции или рантайма: `toSignal() cannot be called from within a reactive context`.
    *   *Физика процесса:* Функция `toSignal` требует наличия статического контекста внедрения зависимостей (`InjectionContext`) для автоматической регистрации уничтожения подписки. Вызов этой функции внутри динамических реактивных блоков `computed()` или `effect()` запрещен на уровне архитектуры Angular.
    *   *Решение:* Всегда объявлять `toSignal` как статическое поле-свойство на уровне инициализации класса компонента.

```typescript
// ОШИБКА: Попытка вызвать toSignal внутри computed-сигнала приведет к крашу
readonly results = computed(() => {
  const stream$ = this.form.valueChanges;
  return toSignal(stream$); // КРИТИЧЕСКАЯ ОШИБКА!
});

// ИСПРАВЛЕНИЕ: Объявление сигнала на уровне свойств класса
readonly querySignal = toSignal(this.form.valueChanges, { initialValue: '' });
readonly results = computed(() => {
  return this.items().filter(item => item.includes(this.querySignal()));
});
```

*   **Ошибка 2: Игнорирование опции `initialValue` при инициализации `toSignal`**
    *   *Симптомы:* Ошибки компиляции TypeScript: `Type 'string | undefined' is not assignable to type 'string'`. Приходится писать постоянные проверки на `undefined` в функциях фильтрации.
    *   *Физика процесса:* Поскольку RxJS-поток не гарантирует мгновенную синхронную отдачу значения при старте подписки, Angular по умолчанию вынужден расширять тип возвращаемого сигнала до `undefined` (тип `Signal<T | undefined>`).
    *   *Решение:* Всегда указывать дефолтное значение в конфигурационном объекте `{ initialValue: '' }`, чтобы сузить тип до чистого `Signal<string>`.

```typescript
// ОШИБКА: Тип сигнала будет Signal<string | undefined>
readonly badQuery = toSignal(this.control.valueChanges);

// ИСПРАВЛЕНИЕ: Тип сигнала строго сужен до Signal<string>
readonly goodQuery = toSignal(this.control.valueChanges, { initialValue: '' });
```

*   **Ошибка 3: Бесконечный цикл перерисовок при неумышленной мутации зависимых сигналов в `computed`**
    *   *Симптомы:* Вкладка браузера зависает, в консоли генерируется бесконечный поток логов, или возникает ошибка: `NG0600: Circular dependency in computed queries...`.
    *   *Физика процесса:* Вычисляемые сигналы `computed` спроектированы как **чистые функции без побочных эффектов** (side-effects free). Попытка внутри тела `computed` вызвать изменение другого сигнала (например, `this.selectedTags.set(...)`) приводит к нарушению реактивного графа и зацикливанию вычислений.
    *   *Решение:* Использовать `computed` исключительно для чтения и трансформации данных (возврат значения через `return`). Любые побочные действия, логгирование или запись в другие сигналы переносить в эффекты `effect()` или обработчики пользовательских событий.

```typescript
// ОШИБКА: Мутация внешнего сигнала внутри вычислений приведет к зацикливанию
readonly badSuggestions = computed(() => {
  const list = this.allTags().filter(t => t.includes(this.query()));
  this.selectedTags.set([]); // КРИТИЧЕСКИЙ СБОЙ: Побочный эффект внутри computed!
  return list;
});

// ИСПРАВЛЕНИЕ: Чистая функция вычисления без побочных действий
readonly goodSuggestions = computed(() => {
  return this.allTags().filter(t => t.includes(this.query()));
});
```