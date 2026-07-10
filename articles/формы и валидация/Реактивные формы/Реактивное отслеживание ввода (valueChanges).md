---
tags: [angular, формы-и-валидация, реактивные-формы]
related: ["Объявление структуры формы через FormBuilder.md", "Связка реактивной формы и автокомплита на Сигналах (computed).md"]
status: "completed"
---

# Реактивное отслеживание ввода (valueChanges)

## БЫСТРЫЙ СТАРТ

*   **valueChanges** — это реактивный RxJS-поток (`Observable`), встроенный в каждый класс управления формами (`FormControl`, `FormGroup`, `FormArray`). Он автоматически генерирует новое событие со свежим значением всякий раз, когда данные в инпуте изменяются пользователем или программно.
*   **Архитектурное назначение:** Предоставляет мощную реактивную шину для реализации живого асинхронного поиска (typeahead), автосохранения черновиков, автозаполнения связанных полей и динамического изменения состояния интерфейса без императивного прослушивания нативных событий `input` или `change`.
*   **Правила использования:**
    *   **Используйте:** Для подавления дребезга ввода (debouncing), предотвращения дублирующих сетевых запросов, автоматического перерасчета связанных полей или каскадной подгрузки данных.
    *   **Не используйте:** Если форма является чисто статической отправляемой формой (submit-only). Для обычного чтения значений при клике на кнопку отправки достаточно использовать метод `form.getRawValue()`, не создавая лишних фоновых подписок RxJS.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Реактивный живой поиск по мере ввода текста (Debounce + SwitchMap)
*   **Назначение:** Описание структуры класса живого поиска `SearchInput`, который слушает ввод пользователя, задерживает отправку на 300 мс, игнорирует повторяющиеся запросы и отменяет предыдущие незавершенные сетевые запросы при вводе новых символов.

#### 1. Файл логики: `search-input.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, filter, switchMap, tap, Observable } from 'rxjs';
import { NetworkSearch } from './services/network-search';

@Component({
  selector: 'app-search-input',
  imports: [ReactiveFormsModule], // Импортируем модуль реактивных форм. standalone: true активен по умолчанию начиная с v19
  templateUrl: './search-input.html',
  styleUrl: './search-input.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SearchInput { // В современной спецификации суффикс Component больше не пишется в названии класса
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly searchService = inject(NetworkSearch); // Внедряем сервис без суффикса Service

  // Сигнал для хранения результатов поиска и отображения в шаблоне
  readonly searchResults = signal<string[]>([]);
  // Сигнал состояния загрузки
  readonly isSearching = signal<boolean>(false);

  // Инициализация формы с одним текстовым полем
  readonly searchForm = this.fb.group({
    query: ['']
  });

  constructor() {
    // Подписка на поток изменений значения конкретного контрола.
    // Используем takeUntilDestroyed() для автоматической отписки при уничтожении компонента.
    this.searchForm.controls.query.valueChanges.pipe(
      // 1. Игнорируем слишком короткие запросы (менее 3 символов)
      filter(text => text.trim().length >= 3 || text.trim().length === 0),
      // 2. Устанавливаем задержку в 300 мс для подавления дребезга (защита бэкенда от флуда запросами)
      debounceTime(300),
      // 3. Пропускаем запрос дальше, только если значение реально изменилось
      distinctUntilChanged(),
      // 4. Помечаем состояние начала поиска
      tap(() => this.isSearching.set(true)),
      // 5. Переключаем поток на асинхронный поиск. 
      // switchMap автоматически отменит предыдущий незавершенный HTTP-запрос, если пользователь введет новый символ.
      switchMap(text => {
        if (!text.trim()) {
          return [[]]; // Возвращаем пустой массив, если строка поиска очищена
        }
        return this.searchService.findByName(text);
      }),
      // 6. Сбрасываем флаг загрузки
      tap(() => this.isSearching.set(false)),
      takeUntilDestroyed() // Безопасное завершение подписки
    ).subscribe(results => {
      // Записываем полученные результаты в реактивный сигнал
      this.searchResults.set(results);
    });
  }
}
```

#### 2. Файл разметки: `search-input.html`
```html
<div class="search-container">
  <!-- Привязка к форме в TypeScript -->
  <form [formGroup]="searchForm">
    <div class="input-wrapper">
      <input type="text" formControlName="query" placeholder="Введите поисковый запрос (мин. 3 символа)..." class="search-field">
      <!-- Динамическое отображение лоадера на основе сигнала -->
      @if (isSearching()) {
        <span class="loader-icon">⌛</span>
      }
    </div>
  </form>

  <ul class="results-list">
    <!-- Итерируемся по найденным результатам -->
    @for (result of searchResults(); track result) {
      <li class="result-item">{{ result }}</li>
    } @empty {
      @if (searchForm.controls.query.value.length >= 3 && !isSearching()) {
        <li class="no-results">По вашему запросу ничего не найдено.</li>
      }
    }
  </ul>
</div>
```

#### 3. Файл стилей: `search-input.css`
```css
.search-container { max-width: 450px; padding: 20px; border: 1px solid var(--border); border-radius: 8px; }
.input-wrapper { display: flex; align-items: center; position: relative; }
.search-field { width: 100%; padding: 10px 40px 10px 12px; background-color: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-normal); outline: none; }
.search-field:focus { border-color: var(--accent); }
.loader-icon { position: absolute; right: 12px; font-size: 1.1rem; color: var(--text-muted); }
.results-list { list-style: none; padding: 0; margin-top: 15px; display: flex; flex-direction: column; gap: 6px; }
.result-item { padding: 8px 12px; background-color: var(--bg-secondary); border-radius: 4px; border-left: 3px solid var(--accent); font-size: 0.9rem; }
.no-results { text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 10px; }
```

---

### Шаблон 2: Связанные выпадающие списки (Каскадный выбор)
*   **Назначение:** Описание структуры класса `CascadingSelects`, где выбор страны в первом выпадающем списке автоматически сбрасывает выбранный город, блокирует поле выбора городов и асинхронно подгружает новый список городов.

#### 1. Файл логики: `cascading-selects.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, tap } from 'rxjs';
import { LocationData } from './services/location-data';

@Component({
  selector: 'app-cascading-selects',
  imports: [ReactiveFormsModule],
  templateUrl: './cascading-selects.html',
  styleUrl: './cascading-selects.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CascadingSelects { // Название класса соответствует современному стандарту без Component-суффикса
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly locationService = inject(LocationData); // Сервис внедряется по его чистому имени класса

  // Списки для хранения динамических опций
  readonly countries = signal<string[]>(['Казахстан', 'Грузия', 'Армения']);
  readonly cities = signal<string[]>([]);
  readonly isCitiesLoading = signal<boolean>(false);

  readonly locationForm = this.fb.group({
    country: [''],
    city: [{ value: '', disabled: true }] // Изначально поле выбора города заблокировано
  });

  constructor() {
    // Отслеживаем изменения в выпадающем списке выбора страны
    this.locationForm.controls.country.valueChanges.pipe(
      tap(() => {
        // 1. При каждой смене страны сбрасываем и блокируем поле города во избежание отправки некорректных связок
        this.locationForm.controls.city.setValue('', { emitEvent: false }); // Предотвращаем запуск лишних событий
        this.locationForm.controls.city.disable({ emitEvent: false });
        this.cities.set([]);
        this.isCitiesLoading.set(true);
      }),
      // 2. Асинхронно запрашиваем список городов для выбранной страны
      switchMap(country => this.locationService.getCitiesByCountry(country)),
      tap(citiesList => {
        this.cities.set(citiesList);
        this.isCitiesLoading.set(false);
        // 3. Разблокируем поле города только в том случае, если города были найдены
        if (citiesList.length > 0) {
          this.locationForm.controls.city.enable({ emitEvent: false });
        }
      }),
      takeUntilDestroyed()
    ).subscribe();
  }
}
```

#### 2. Файл разметки: `cascading-selects.html`
```html
<div class="location-box">
  <h3>Географическая привязка профиля</h3>

  <form [formGroup]="locationForm" class="grid-form">
    
    <div class="field">
      <label for="country">Страна проживания:</label>
      <select id="country" formControlName="country" class="select-field">
        <option value="">-- Выберите страну --</option>
        @for (country of countries(); track country) {
          <option [value]="country">{{ country }}</option>
        }
      </select>
    </div>

    <div class="field">
      <label for="city">Город:</label>
      <select id="city" formControlName="city" class="select-field">
        <option value="">
          @if (isCitiesLoading()) {
            Загрузка городов...
          } @else {
            -- Выберите город --
          }
        </option>
        @for (city of cities(); track city) {
          <option [value]="city">{{ city }}</option>
        }
      </select>
    </div>
    
  </form>
</div>
```

#### 3. Файл стилей: `cascading-selects.css`
```css
.location-box { max-width: 400px; padding: 20px; border: 1px solid var(--border); border-radius: 8px; }
.grid-form { display: flex; flex-direction: column; gap: 15px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: 0.85rem; font-weight: 600; color: var(--text-muted); }
.select-field { padding: 8px 12px; background-color: var(--bg-secondary); border: 1px solid var(--border); border-radius: 6px; color: var(--text-normal); outline: none; cursor: pointer; }
.select-field:focus { border-color: var(--accent); }
.select-field:disabled { opacity: 0.5; cursor: not-allowed; background-color: var(--bg-primary); }
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектура реактивного конвейера RxJS-операторов
Работа с `valueChanges` в Angular построена на мощи библиотеки RxJS. Применение операторов в методе `.pipe()` позволяет гибко настроить логику прохождения данных:
*   `debounceTime(X)`: Задерживает прохождение сигналов на `X` миллисекунд. Если в течение этого времени придет новый символ, таймер сбросится. Это критически важно для защиты API бэкенда от перегрузки при быстром вводе пользователя.
*   `distinctUntilChanged()`: Фильтрует дублирующиеся события. Например, если пользователь быстро нажал «Backspace», а затем вернул ту же букву обратно до истечения таймаута debounce, оператор заблокирует отправку дублирующего сетевого запроса.
*   `switchMap(callback)`: Решает классическую проблему гонок асинхронных запросов (Race Conditions). Если пользователь ввел букву «А» (ушел запрос 1), а через секунду ввел «Б» (ушел запрос 2), и сервер вернул ответ на запрос 2 раньше, чем на запрос 1, то в старых архитектурах на экране могли отобразиться неверные данные. `switchMap` автоматически отменяет подписку на предыдущий незавершенный запрос при появлении нового значения, гарантируя вывод только актуальной информации.

### 2. Предотвращение бесконечных рекурсий через опцию `emitEvent`
По умолчанию при любом изменении значения контрола через методы `.setValue()` или `.patchValue()`, Angular инициирует генерацию нового события в поток `valueChanges`. 

Если вы подписываетесь на `valueChanges` контрола и внутри этого колбэка пытаетесь изменить значение этого же контрола (или родительской группы), вы рискуете запустить бесконечную рекурсивную петлю событий, которая мгновенно переполнит стек вызовов браузера и приведет к падению приложения.

Для предотвращения таких ситуаций предусмотрен конфигурационный объект `{ emitEvent: false }`. Передача этой опции в методы `.setValue()` или `.patchValue()` заставляет Angular обновить внутреннее состояние контрола и перерисовать его в HTML, но полностью блокирует генерацию события в потоках `valueChanges` и `statusChanges`.

### 3. Пошаговый разбор фаз прохождения данных в каскадном выборе
При выборе страны «Казахстан» в `CascadingSelects`:
1.  **Срабатывание события UI:** Браузер фиксирует выбор опции в выпадающем списке, обновляет значение `FormControl` в модели.
2.  **Генерация события потока:** Поток `valueChanges` генерирует строку `'Казахстан'`.
3.  **Выполнение блока `tap`:** Срабатывает первый оператор. Метод `.setValue('', { emitEvent: false })` сбрасывает выбранный ранее город. Свойство `emitEvent: false` гарантирует, что это действие не запустит ложное срабатывание по цепочке. Поле города блокируется, очищаясь из UI.
4.  **Асинхронный запрос:** Оператор `switchMap` перенаправляет строку в `LocationData`, который отправляет HTTP-запрос.
5.  **Разблокировка интерфейса:** При успешном получении ответа срабатывает второй `tap`, записывающий список городов в сигнал. Вызывается метод `.enable({ emitEvent: false })`, делающий поле города доступным для взаимодействия.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Бесконечный рекурсивный цикл (Infinite Loop) при самообновлении полей**
    *   *Симптомы:* Вкладка браузера намертво зависает, в консоли отображается ошибка переполнения стека: `RangeError: Maximum call stack size exceeded`.
    *   *Физика процесса:* Изменение значения внутри подписки на то же самое поле без отключения событий запускает цепную реакцию: Изменение -> Событие -> Изменение в обработчике -> Новое событие -> Новый запуск обработчика.
    *   *Решение:* Использовать опцию `{ emitEvent: false }` при любых программных изменениях внутри реактивных подписок.

```typescript
// ОШИБКА: Запустит бесконечный цикл событий
this.form.controls.query.valueChanges.subscribe(text => {
  this.form.controls.query.setValue(text.toUpperCase()); 
});

// ИСПРАВЛЕНИЕ: Блокировка генерации повторного события
this.form.controls.query.valueChanges.subscribe(text => {
  this.form.controls.query.setValue(text.toUpperCase(), { emitEvent: false });
});
```

*   **Ошибка 2: Утечки памяти (Memory Leaks) из-за незакрытых подписок на `valueChanges`**
    *   *Симптомы:* Потребление оперативной памяти приложением непрерывно растет при переходах между страницами; подписки продолжают выполняться в фоне даже после удаления компонента с экрана.
    *   *Физика процесса:* Метод `.subscribe()` создает долгоживущую ссылку в памяти. Если не отписаться от потока явно при уничтожении компонента, сборщик мусора V8 не сможет удалить инстанс компонента, так как на него продолжает ссылаться реактивный граф форм.
    *   *Решение:* Использовать оператор `takeUntilDestroyed` в Angular 16+ или ручное управление отписками через `Subscription.unsubscribe()`.

```typescript
// ОШИБКА: Поток останется активным в памяти навсегда после уничтожения компонента
this.form.valueChanges.subscribe(val => console.log(val));

// ИСПРАВЛЕНИЕ: Автоматическая привязка времени жизни подписки к компоненту
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

this.form.valueChanges.pipe(
  takeUntilDestroyed() // Angular автоматически завершит поток при деструкции класса
).subscribe(val => console.log(val));
```

*   **Ошибка 3: Выполнение тяжелых сетевых запросов при получении невалидных промежуточных данных**
    *   *Симптомы:* Бэкенд получает запросы с некорректным форматом (например, недопустимые символы email), возвращая ошибки 400 Bad Request.
    *   *Физика процесса:* Поток `valueChanges` генерирует события на каждый чих пользователя, даже если поле находится в статусе `INVALID`.
    *   *Решение:* Фильтровать поток изменений, проверяя валидность контрола перед отправкой данных на сервер, либо использовать статус-ориентированный поток `statusChanges`.

```typescript
// ОШИБКА: Отправка запроса пойдет даже если email введен не полностью
this.emailControl.valueChanges.pipe(
  debounceTime(300),
  switchMap(email => this.api.checkEmail(email))
).subscribe();

// ИСПРАВЛЕНИЕ: Фильтрация потока по статусу валидности
this.emailControl.valueChanges.pipe(
  debounceTime(300),
  // Пропускаем значение дальше, только если поле прошло все валидации
  filter(() => this.emailControl.valid),
  switchMap(email => this.api.checkEmail(email))
).subscribe();
```