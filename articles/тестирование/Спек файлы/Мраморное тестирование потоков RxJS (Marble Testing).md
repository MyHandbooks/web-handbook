---
tags: [angular, RxJS, тестирование, unit-test, marble-testing]
related: ["[[Тестирование изолированного сервиса (Unit Test).md]]", "[[Продвинутые операторы RxJS и управление потоками.md]]", "[[Управление временными задержками (debounceTime, throttleTime, auditTime, delay).md]]"]
status: "completed"
---

# Мраморное тестирование потоков RxJS (Marble Testing)

## БЫСТРЫЙ СТАРТ

*   **Мраморное тестирование (Marble Testing)** — это декларативный способ модульного тестирования асинхронных потоков RxJS с использованием ASCII-диаграмм и виртуального планировщика времени `TestScheduler`.
*   **Синтаксис мраморных строк:**
    *   `-` — один виртуальный квант времени (по умолчанию 1 фрейм = 1мс).
    *   `a`, `b`, `c` — испускание значения (next).
    *   `|` — успешное завершение потока (complete).
    *   `#` — завершение потока с ошибкой (error).
    *   `()` — синхронная группировка нескольких событий в один и тот же квант времени: `(abc|)`.
    *   `^` — точка старта подписки (Subscription point) для горячих потоков.
*   **Используйте для:** детерминированного тестирования операторов времени (`debounceTime`, `throttleTime`, `delay`), сложных комбинаций (`combineLatest`, `switchMap`) и очередей без реального ожидания секунд на CI/CD.
*   **Не используйте:** для тривиальных синхронных потоков из одного значения `of(10)` (для них быстрее написать стандартный `subscribe` с `done()`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Настройка TestScheduler и тестирование оператора задержки (debounce)
*   **Назначение:** Проверка логики сервиса живого поиска `SearchFilterService`, отсекающего быстрый ввод с задержкой в 300мс с помощью нативного `TestScheduler` из `rxjs/testing`.

#### 1. Файл тестируемой службы: `search-filter.service.ts`
```typescript
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SearchFilterService {
  /**
   * Применяет дебаунс, фильтрацию коротких строк и перевод в верхний регистр
   */
  public processSearchQuery(source$: Observable<string>): Observable<string> {
    return source$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      filter((text) => text.trim().length >= 3),
      map((text) => text.toUpperCase())
    );
  }
}
```

#### 2. Файл мраморного теста: `search-filter.service.spec.ts`
```typescript
import { TestBed } from '@angular/core/testing';
import { TestScheduler } from 'rxjs/testing';
import { SearchFilterService } from './search-filter.service';

describe('SearchFilterService (Marble Testing)', () => {
  let service: SearchFilterService;
  let testScheduler: TestScheduler;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SearchFilterService]
    });

    service = TestBed.inject(SearchFilterService);

    // Инициализируем TestScheduler с функцией сравнения для Jasmine
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it('должен подавлять быстрый ввод и выдавать результат строго через 300мс', () => {
    // Метод run() активирует виртуальное время внутри переданного коллбэка
    testScheduler.run(({ hot, expectObservable }) => {
      // 1. Моделируем входящий поток ввода пользователя (hot stream)
      // Пользователь вводит 'a', затем через 100мс 'ab', затем через 100мс 'abc' и останавливается
      const inputMarbles = ' -a 99ms b 99ms c 500ms |';
      const inputValues = { a: 'a', b: 'ab', c: 'abc' };

      const source$ = hot(inputMarbles, inputValues);

      // 2. Пропускаем поток через метод сервиса
      const output$ = service.processSearchQuery(source$);

      // 3. Описываем ожидаемый результат на временной шкале:
      // 'a' и 'ab' отсеяны дебаунсом. 
      // Через 300мс после ввода 'c' (abc) испускается значение 'ABC'
      const expectedMarbles = '------------------- 299ms d 200ms |';
      const expectedValues = { d: 'ABC' };

      // 4. Сверяем виртуальную шкалу времени
      expectObservable(output$).toBe(expectedMarbles, expectedValues);
    });
  });
});
```

---

### Шаблон 2: Мраморный тест переключения потоков (`switchMap`)
*   **Назначение:** Проверка отмены старого асинхронного запроса при поступлении нового события.

```typescript
import { TestBed } from '@angular/core/testing';
import { TestScheduler } from 'rxjs/testing';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

describe('SwitchMap Logic (Marble Test)', () => {
  let testScheduler: TestScheduler;

  beforeEach(() => {
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it('должен отменять первый внутренний запрос при поступлении второго', () => {
    testScheduler.run(({ cold, hot, expectObservable }) => {
      // Внешний поток кликов: клик 'a', затем через 20мс клик 'b'
      const clicks$ = hot('  -a--b----|');
      
      // Внутренний холодный сетевой запрос, занимающий 40мс
      const requestCold$ = cold('---x|', { x: 'Response' });

      // Применяем switchMap
      const result$ = clicks$.pipe(
        switchMap(() => requestCold$)
      );

      // Первый запрос 'a' начнется на 1мс, но будет прерван кликом 'b' на 4мс.
      // Завершится только запрос 'b', испустив значение через 30мс после своего старта
      const expectedMarbles = '-------x-|';
      const expectedValues = { x: 'Response' };

      expectObservable(result$).toBe(expectedMarbles, expectedValues);
    });
  });
});
```

---

### Шаблон 3: Тестирование обработки сетевых ошибок и авто-повтора (`retry`)
*   **Назначение:** Проверка логики перезапуска потока ровно 2 раза перед окончательным падением.

```typescript
import { TestScheduler } from 'rxjs/testing';
import { retry } from 'rxjs/operators';

describe('Retry Stream (Marble Test)', () => {
  let testScheduler: TestScheduler;

  beforeEach(() => {
    testScheduler = new TestScheduler((actual, expected) => {
      expect(actual).toEqual(expected);
    });
  });

  it('должен повторить попытку 2 раза и выбросить ошибку', () => {
    testScheduler.run(({ cold, expectObservable, expectSubscriptions }) => {
      // Холодный поток, который выдает 'a' и падает с ошибкой '#'
      const unstableSource$ = cold('-a-#', { a: 'Value' }, new Error('Network Error'));

      const result$ = unstableSource$.pipe(
        retry(2) // 1 исходная попытка + 2 повтора = 3 запуска
      );

      // Ожидаемый результат: 3 раза значение 'a', затем терминальная ошибка '#'
      const expectedMarbles = '-a--a--a-#';
      const expectedValues = { a: 'Value' };
      const expectedError = new Error('Network Error');

      expectObservable(result$).toBe(expectedMarbles, expectedValues, expectedError);

      // Проверяем точки подписок: поток подписывался ровно 3 раза
      const expectedSubs = [
        '^--!',       // 1-я попытка
        '---^--!',    // 2-я попытка
        '------^--!'  // 3-я попытка
      ];
      expectSubscriptions(unstableSource$.subscriptions).toBe(expectedSubs);
    });
  });
});
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная физика TestScheduler и виртуальное время
В реальном приложении оператор `debounceTime(1000)` использует нативный таймер `setTimeout(fn, 1000)` операционной системы. Запуск 100 таких тестов заставил бы CI/CD сервер ждать более 100 реальных секунд.

`TestScheduler` решает эту проблему за счет **виртуализации времени**:
1.  Внутри блока `testScheduler.run()` все операторы времени RxJS временно подменяют нативные таймеры на виртуальную шкалу тактов (Virtual Clock).
2.  Один дефис `-` на мраморной диаграмме равен **1 кадру виртуального времени** (по умолчанию 1мс).
3.  Запись `99ms` в диаграмме перематывает виртуальные часы вперед на 99 тактов мгновенно за 0 процессорных миллисекунд.
4.  Все события выполняются в детерминированном, пошаговом порядке без реального ожидания на процессоре.

```text
Синхронизация виртуального времени TestScheduler:
Шкала:    0ms---1ms---2ms---3ms---4ms---5ms---...---300ms
События:  -(a)---------------------------------------(ABC|)
          | 1 фрейм |          299 фреймов          | complete
```

### 2. Синтаксис и правила форматирования мраморных диаграмм
*   **Холодные потоки (`cold`):** Подписка на них начинается в момент старта проверки (`^`). Каждый подписчик запускает свою шкалу с нулевой секунды.
*   **Горячие потоки (`hot`):** Ведут себя как события мыши или `Subject`. Их временная шкала идет непрерывно, а символ `^` задает момент, когда тестовый подписчик фактически подключился к потоку.
*   **Проверка подписок (`expectSubscriptions`):**
    *   `^` — момент оформления подписки.
    *   `!` — момент отписки (Unsubscription).

---

### 3. Типичные ошибки и их решение

*   **Ошибка 1: Забытый `testScheduler.run()`**
    *   *Симптомы:* Ошибка рантайма: `Cannot read properties of undefined (reading 'hot')` или тесты зависают.
    *   *Физика процесса:* Хелперы `hot`, `cold`, `expectObservable` передаются в качестве аргументов функции обратного вызова внутри метода `testScheduler.run(({ hot, cold, ... }) => { ... })`. Они не существуют в глобальной области видимости.
    *   *Решение:* Оборачивайте тело каждого мраморного теста в вызов `testScheduler.run()`.

*   **Ошибка 2: Несовпадение фреймов времени на 1 такт (Frame Mismatch)**
    *   *Симптомы:* Тест падает с ошибкой: `Expected "-a---|", but received "--a--|"`.
    *   *Физика процесса:* Каждый символ (буква, дефис, пробел) занимает ровно 1 виртуальный квант времени. Случайный лишний пробел или дефис в строке диаграммы сдвигает ожидаемое время на 1мс.
    *   *Решение:* Точно считайте количество символов в строках диаграмм или используйте явные маркеры времени (`10ms`, `300ms`).

*   **Ошибка 3: Пропуск проверки ошибок при сравнении объектов**
    *   *Симптомы:* Тест падает при проверке терминальной ошибки `#`, сообщая о несовпадении `Error`.
    *   *Физика процесса:* Метод `expectObservable` сравнивает объект ошибки по значению. Если в источнике был сгенерирован `new Error('Msg')`, а в третьем параметре `expectObservable` передана простая строка `'Msg'`, тест завершится неудачей.
    *   *Решение:* Передавайте точный объект экземпляра `Error` в третий аргумент `expectObservable(stream$).toBe(marbles, values, errorObject)`.
