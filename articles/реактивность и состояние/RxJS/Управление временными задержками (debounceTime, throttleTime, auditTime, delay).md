---
tags: [angular, RxJS, архитектура]
related: ["[[Анатомия конвейера pipe и базовые операторы обработки (map, filter, tap).md]]", "[[Преобразования RxJS потоков (switchMap, concatMap).md]]"]
status: "completed"
---

# Управление временными задержками (debounceTime, throttleTime, auditTime, delay)

## БЫСТРЫЙ СТАРТ

*   **Операторы времени (Time-based Operators)** — специализированные инструменты RxJS, предназначенные для контроля и фильтрации частоты прохождения событий по временной шкале. Они защищают бэкенд от избыточной нагрузки и предотвращают лавинообразные циклы перерисовки интерфейса.
*   **Четыре фундаментальных оператора:**
    *   `debounceTime(delay)` — ожидает период полного затишья (тишины) длительностью `delay` миллисекунд и только после этого испускает последнее значение. Используется для живого поиска и автосохранения форм.
    *   `throttleTime(duration)` — испускает значение мгновенно, а затем полностью игнорирует любые последующие события в течение временного окна `duration`. Используется для защиты кнопок от спама кликами.
    *   `auditTime(duration)` — при поступлении события открывает временное окно `duration`, игнорирует промежуточные значения и по истечении таймера испускает строго последнее (самое свежее) значение. Используется для плавной прокрутки страниц (scroll) или отслеживания ресайза.
    *   `delay(duration)` — сдвигает абсолютно все проходящие по цепочке значения вперед во времени на фиксированную задержку. Используется для симуляции задержек сети или анимационных пауз.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Подавление дребезга при вводе в поисковую строку (`debounceTime`)
*   **Назначение:** Реализация строки живого поиска, которая отправляет HTTP-запрос только тогда, когда пользователь сделал паузу в наборе текста.

#### 1. Файл логики: `debounce-search.ts`
```typescript
import { Component, inject, OnInit, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Component({
  selector: 'app-debounce-search',
  // standalone: true опускается по умолчанию начиная с v19
  imports: [
    ReactiveFormsModule // Импортируем ReactiveFormsModule для связи с searchControl
  ],
  templateUrl: './debounce-search.html',
  styleUrl: './debounce-search.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DebounceSearch implements OnInit { // Имя класса очищено от суффикса Component
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  public readonly searchControl = new FormControl<string>('', { nonNullable: true });

  public ngOnInit(): void {
    this.searchControl.valueChanges.pipe(
      // Ждем 400 миллисекунд полной тишины после последнего нажатия клавиши.
      // Если пользователь продолжает вводить буквы быстрее, события сжимаются
      debounceTime(400),
      
      // Пропускаем дальше только если очищенный текст реально отличается от предыдущего
      distinctUntilChanged(),
      
      switchMap((query) => {
        const trimmed = query.trim();
        if (!trimmed) return of([]);

        return this.http.get<string[]>(`/api/v1/search?q=${trimmed}`).pipe(
          catchError(() => of([]))
        );
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((results) => console.log('Результаты поиска:', results));
  }
}
```

#### 2. Файл разметки: `debounce-search.html`
```html
<div class="search-box">
  <input type="text" [formControl]="searchControl" placeholder="Начните ввод..." class="theme-input" />
</div>
```

#### 3. Файл стилей: `debounce-search.css`
```css
.search-box {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
```

---

### Шаблон 2: Блокировка спама кликами по кнопке оплаты (`throttleTime`)
*   **Назначение:** Защита финансовых транзакций или отправки форм от случайных двойных или множественных кликов пользователя.

#### 1. Файл логики: `throttle-button.ts`
```typescript
import { Component, inject, OnInit, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { throttleTime } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-throttle-button',
  imports: [],
  templateUrl: './throttle-button.html',
  styleUrl: './throttle-button.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ThrottleButton implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  // Горячий поток кликов по кнопке
  private readonly payClicks$ = new Subject<void>();

  public ngOnInit(): void {
    this.payClicks$.pipe(
      // Пропускает первый клик МГНОВЕННО, а затем наглухо блокирует 
      // любые повторные нажатия в течение следующих 2 секунд (2000мс)
      throttleTime(2000),
      
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(() => this.executePaymentTransaction());
  }

  public onPayClick(): void {
    this.payClicks$.next();
  }

  private executePaymentTransaction(): void {
    console.warn('[Payment] Транзакция инициирована на сервере...');
  }
}
```

#### 2. Файл разметки: `throttle-button.html`
```html
<div class="pay-container">
  <button (click)="onPayClick()" class="action-btn">Оплатить заказ</button>
</div>
```

#### 3. Файл стилей: `throttle-button.css`
```css
.pay-container {
  padding: 12px;
}
.action-btn {
  padding: 10px 20px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
```

---

### Шаблон 3: Плавное сжатие логов ресайза окна браузера (`auditTime`)
*   **Назначение:** Оптимизация обработки тяжелых геометрических вычислений при изменении размеров экрана без задержки первого кадра анимации.

#### 1. Файл логики: `resize-spy.ts`
```typescript
import { Component, inject, OnInit, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { fromEvent } from 'rxjs';
import { auditTime, map } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-resize-spy',
  imports: [],
  templateUrl: './resize-spy.html',
  styleUrl: './resize-spy.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResizeSpy implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  public ngOnInit(): void {
    // Слушаем глобальное нативное событие resize окна браузера
    fromEvent(window, 'resize').pipe(
      // При получении события открывает окно в 100мс.
      // Игнорирует промежуточный спам событиями ресайза от ОС,
      // по истечении 100мс испускает строго последнее стабильное значение
      auditTime(100),
      
      map(() => window.innerWidth),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((width) => {
      this.recalculateLayoutGrid(width);
    });
  }

  private recalculateLayoutGrid(width: number): void {
    console.log(`[Layout] Сетка перестроена под ширину экрана: ${width}px`);
  }
}
```

#### 2. Файл разметки: `resize-spy.html`
```html
<div class="resize-panel">
  <p>Монитор размеров окна активен</p>
</div>
```

#### 3. Файл стилей: `resize-spy.css`
```css
.resize-panel {
  padding: 16px;
  background-color: var(--bg-secondary);
  border-radius: 8px;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Как планировщики (Schedulers) управляют временем в V8
Потоки RxJS по умолчанию работают синхронно. Но операторы времени привязаны к асинхронной природе.

Когда вы подключаете оператор `debounceTime(400)`:
1.  Оператор неявно использует специальный системный сервис — **`AsyncScheduler`** (Планировщик асинхровости).
2.  При получении значения из сети или от инпута `AsyncScheduler` регистрирует макрозадачу таймера на уровне нативного браузерного API `setTimeout(callback, 400)`.
3.  Если за время работы таймера прилетает новое событие, старый зарегистрированный таймер уничтожается через `clearTimeout()`, а планировщик заводит новый таймер на 400мс.
4.  Только когда таймер успешно доходит до конца, значение выталкивается из конвейера в поток.

Это означает, что операторы времени активно используют системный пул макрозадач (MacroTask Queue) событийного цикла браузера (Event Loop), и неверная настройка задержек на терабайтах данных может вызвать перегрузку таймеров.

### 2. Сравнение стратегий: Throttle vs Audit vs Debounce
Понимание разницы между этими тремя операторами критично для Senior-разработчика:

*   **`debounceTime(X)` (Пауза тишины):** Событие испустится только тогда, когда поток полностью "замолчит" на X миллисекунд. Любая активность сбрасывает таймер заново. Подходит для сценариев, где важен окончательный, стабильный результат (живой поиск).
*   **`throttleTime(X)` (Игнорирование хвоста):** Первое событие пропускается мгновенно. Последующие события в окне X миллисекунд полностью уничтожаются. Подходит для блокировок действий (клики по кнопкам).
*   **`auditTime(X)` (Сжатие кэша):** Первое событие открывает таймер, но **не испускается сразу**. В течение X миллисекунд поток накопливает значения, перезаписывая старые новыми. По истечении X миллисекунд испускается строго последнее накопленное значение. Подходит для периодической фоновой отправки данных (scroll, mousemove).

### 3. Продвинутая конфигурация throttleTime
По умолчанию оператор `throttleTime` пропускает первое событие и игнорирует последующие. Но его поведение можно тонко перенастроить с помощью объекта конфигурации:

```typescript
throttleTime(2000, asyncScheduler, {
  leading: true,  // Пропускать ли первое значение в начале окна (по умолчанию true)
  trailing: true  // Пропускать ли последнее значение по завершении окна (по умолчанию false)
})
```

Если включить оба флага (`leading: true, trailing: true`), то при спаме кликами кнопка сработает мгновенно в начале клика, а также гарантированно сработает еще один раз через 2 секунды после завершения спама, отправив последнее накопленное действие.

### 4. Детальный пошаговый разбор выполнения шаблона 1
Проследим обрезку событий при быстром вводе слова `Angular`:
1.  **Символ `A`:** Инпут испускает `'A'`. `debounceTime(400)` регистрирует `Timer_1` на 400мс. Значение удерживается в буфере.
2.  **Символ `n`:** Спустя 150мс пользователь вводит `'n'`. `debounceTime` перехватывает событие. `Timer_1` экстренно уничтожается. Регистрируется новый `Timer_2` на 400мс. В буфере теперь лежит `'An'`.
3.  **Символы `g`, `u`, `l`, `a`, `r`:** Ввод продолжается быстро. Каждый новый символ сбрасывает предыдущий таймер.
4.  **Пауза:** Введено слово `'Angular'`. Зарегистрирован `Timer_7` на 400мс. Пользователь замер и перестал печатать.
5.  **Срабатывание:** Спустя 400мс полной тишины `Timer_7` успешно доходит до финала. Значение `'Angular'` выталкивается из буфера.
6.  **Трансформация:** `distinctUntilChanged()` проверяет, отличается ли `'Angular'` от предыдущего поиска. Да, отличается. Строка уходит в `switchMap` для сетевого запроса к API.

---

### 5. Типичные ошибки и их решение

*   **Ошибка 1: Ошибочное использование `debounceTime` для защиты кнопок от двойного клика**
    *   *Симптомы:* Пользователь кликает на кнопку «Оплатить», но платеж не уходит мгновенно. Он отправляется только через 2 секунды после того, как пользователь полностью убрал руку с мышки. Это раздражает пользователя, и он начинает кликать еще яростнее.
    *   *Причина:* `debounceTime` ждет тишины. Первое событие удерживается в буфере.
    *   *Решение:* Для защиты кнопок от спама всегда строго используйте `throttleTime` (пропускает клик мгновенно) или `exhaustMap` (блокирует повторные запросы до ответа сервера).

```typescript
// ПЛОХО (Платеж задержится на 2 секунды, заставляя пользователя нервничать)
// const payments$ = payClicks$.pipe(debounceTime(2000));

// ХОРОШО (Клик сработает мгновенно, а повторные заблокируются на 2 секунды)
const payments$ = payClicks$.pipe(throttleTime(2000));
```

*   **Ошибка 2: Прогрессирующие утечки памяти при тестировании без фиктивных часов**
    *   *Симптомы:* Юнит-тесты асинхронных компонентов с операторами времени зависают или падают по таймауту.
    *   *Причина:* Обычный запуск тестов заставляет асинхронный планировщик честно ожидать реальные миллисекунды в операционной системе, замедляя сборку CI/CD пайплайнов.
    *   *Решение:* Всегда тестируйте операторы времени в среде виртуального времени с использованием `fakeAsync` и вызова `tick(ms)` для мгновенной симуляции прохождения времени на уровне компилятора.

*   **Ошибка 3: Потеря точности координат при использовании throttleTime на скролле**
    *   *Симптомы:* Элемент интерфейса дергается или замирает не в тех координатах при быстрой прокрутке страницы.
    *   *Причина:* `throttleTime` пропускает первое событие начала скролла, а затем полностью игнорирует события до конца окна. Из-за этого финальное, самое важное событие остановки скролла (с итоговыми точными координатами) отбрасывается оператором.
    *   *Решение:* Используйте `auditTime` (который гарантированно вернет самое последнее, точное значение на момент закрытия окна) или настраивайте `throttleTime` с флагом `trailing: true`.

```typescript
// ПЛОХО (Финальное положение скролла будет утеряно)
// const scroll$ = fromEvent(window, 'scroll').pipe(throttleTime(100));

// ХОРОШО (Финальное точное положение скролла гарантированно дойдет до UI)
const scroll$ = fromEvent(window, 'scroll').pipe(auditTime(100));
```