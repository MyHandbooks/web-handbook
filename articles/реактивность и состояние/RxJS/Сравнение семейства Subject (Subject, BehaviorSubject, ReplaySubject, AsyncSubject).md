---
tags: [angular, RxJS, архитектура, реактивность]
related: ["[[Введение в реактивное программирование и RxJS.md]]", "[[Управление состоянием сервиса через BehaviorSubject.md]]", "[[Совместное использование потоков (shareReplay).md]]"]
status: "completed"
---

# Сравнение семейства Subject (Subject, BehaviorSubject, ReplaySubject, AsyncSubject)

## БЫСТРЫЙ СТАРТ

*   **Класс `Subject`** — это гибридный примитив RxJS, который одновременно является и источником данных (`Observable`), и приемником (`Observer`). Он позволяет вручную отправлять события подписчикам через метод `.next()`.
*   **Четыре типа Subject и их различия:**
    *   `Subject` — не хранит историю. Новые подписчики получают только те события, которые будут испущены **после** момента их подписки.
    *   `BehaviorSubject(initialValue)` — хранит **ровно 1 последнее значение**. Требует обязательное начальное значение в конструкторе. Мгновенно выдает последнее значение новому подписчику при подписке и дает синхронный доступ через `.getValue()`.
    *   `ReplaySubject(bufferSize, windowTime)` — хранит **историю из $N$ последних значений** (или за определенный интервал времени). Не требует начального значения. При подписке "проигрывает" всю сохраненную историю новому подписчику.
    *   `AsyncSubject` — ждет полного завершения потока (`complete()`) и только в этот момент испускает **одно самое последнее значение**. Если поток не вызвал `complete()`, подписчики никогда ничего не получат.
*   **Используйте для:** создания централизованных шин событий (Event Bus), многопользовательских кэшей данных, брокеров сообщений и реактивных сторов.
*   **Не используйте для:** простого локального синхронного состояния UI (для этого проще и быстрее использовать `signal()`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Сравнительная демонстрация поведения всех 4 типов Subject
*   **Назначение:** Сервис наглядно демонстрирует разницу в получении данных между `Subject`, `BehaviorSubject`, `ReplaySubject` и `AsyncSubject` при поздней подписке.

```typescript
import { Injectable } from '@angular/core';
import { Subject, BehaviorSubject, ReplaySubject, AsyncSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SubjectComparisonService {
  // 1. Обычный Subject: без памяти
  public readonly plainSubject$ = new Subject<string>();

  // 2. BehaviorSubject: требует начальное значение, держит 1 последнее
  public readonly behaviorSubject$ = new BehaviorSubject<string>('Начальное значение');

  // 3. ReplaySubject: запоминает 2 последних значения
  public readonly replaySubject$ = new ReplaySubject<string>(2);

  // 4. AsyncSubject: выдаст только последнее значение и строго после complete()
  public readonly asyncSubject$ = new AsyncSubject<string>();

  public emitEvents(): void {
    // Имитируем отправку трех событий подряд
    console.log('--- Эмиссия событий A и B ---');
    
    this.plainSubject$.next('Событие A');
    this.plainSubject$.next('Событие B');

    this.behaviorSubject$.next('Событие A');
    this.behaviorSubject$.next('Событие B');

    this.replaySubject$.next('Событие A');
    this.replaySubject$.next('Событие B');

    this.asyncSubject$.next('Событие A');
    this.asyncSubject$.next('Событие B');
  }

  public subscribeLate(): void {
    console.log('--- Поздняя подписка (после эмиссий A и B) ---');

    // Subject: Ничего не выведет, так как события A и B уже прошли
    this.plainSubject$.subscribe(val => console.log(`[Subject]: ${val}`));

    // BehaviorSubject: Выведет "Событие B" (последнее актуальное)
    this.behaviorSubject$.subscribe(val => console.log(`[BehaviorSubject]: ${val}`));

    // ReplaySubject: Выведет и "Событие A", и "Событие B" (буфер размера 2)
    this.replaySubject$.subscribe(val => console.log(`[ReplaySubject]: ${val}`));

    // AsyncSubject: Пока ничего не выведет, ждет complete()
    this.asyncSubject$.subscribe(val => console.log(`[AsyncSubject]: ${val}`));
  }

  public completeAsyncSubject(): void {
    console.log('--- Вызов complete() на AsyncSubject ---');
    // Только сейчас подписчик AsyncSubject получит "Событие B" и завершится
    this.asyncSubject$.complete();
  }
}
```

---

### Шаблон 2: Кэширование истории логов через `ReplaySubject` с ограничением по времени
*   **Назначение:** Сервис системных логов хранит историю сообщений только за последние 5 секунд (Buffer Time), автоматически отбрасывая устаревшие логи.

```typescript
import { Injectable } from '@angular/core';
import { ReplaySubject, Observable } from 'rxjs';

export interface SystemLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class SystemLogService {
  // Храним максимум 50 записей, но не старше 5000 миллисекунд (5 секунд)
  private readonly logBuffer$ = new ReplaySubject<SystemLog>(50, 5000);

  // Экспортируем только для чтения
  public readonly logs$: Observable<SystemLog> = this.logBuffer$.asObservable();

  public addLog(level: 'info' | 'warn' | 'error', message: string): void {
    this.logBuffer$.next({
      timestamp: Date.now(),
      level,
      message
    });
  }
}
```

---

### Шаблон 3: Однократное асинхронное вычисление через `AsyncSubject`
*   **Назначение:** Сервис выполняет тяжелый расчет хэша конфигурации и раздает финальный результат всем подписчикам (как `Promise`, но в парадигме RxJS).

```typescript
import { Injectable } from '@angular/core';
import { AsyncSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ConfigHashCalculator {
  private readonly hashCalculation$ = new AsyncSubject<string>();

  public getHash(): Observable<string> {
    return this.hashCalculation$.asObservable();
  }

  public computeHash(data: string): void {
    // Имитируем тяжелое асинхронное вычисление
    setTimeout(() => {
      const computedHash = `sha256_${data.length}_${Date.now()}`;
      
      // Отправляем значение
      this.hashCalculation$.next(computedHash);
      
      // ОБЯЗАТЕЛЬНО вызываем complete(), иначе подписчики не получат результат!
      this.hashCalculation$.complete();
    }, 1500);
  }
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурное сравнение и внутренняя структура в памяти

```text
1. Subject (Без буфера)
   Эмиссии:     ---[A]---[B]-----------------[C]--->
   Подписка:                  ▲ (Subscribe)
   Результат:                 ---------------[C]---> (A и B утеряны)

2. BehaviorSubject (Буфер: 1 элемент + Начальное значение)
   Эмиссии:     [Init]---[A]---[B]-----------[C]--->
   Подписка:                    ▲ (Subscribe)
   Результат:                   [B]----------[C]---> (Мгновенно получил B)

3. ReplaySubject (Буфер: N элементов)
   Эмиссии:     ---[A]---[B]---[C]-----------[D]--->
   Подписка:                        ▲ (Subscribe, bufferSize=2)
   Результат:                       [B]-[C]--[D]---> (Мгновенно получил B и C)

4. AsyncSubject (Только последнее значение строго при complete)
   Эмиссии:     ---[A]---[B]---[C]---(complete)---->
   Подписка:          ▲ (Subscribe)
   Результат:   ---------------------[C]-(complete)-> (Получил C только после complete)
```

| Тип Subject | Начальное значение | Размер буфера | Когда выдает данные новому подписчику? | Синхронный геттер (`getValue`) |
| :--- | :---: | :---: | :--- | :---: |
| **`Subject`** | Нет | 0 | Только при наступлении будущих событий | Нет |
| **`BehaviorSubject`** | **Да** (обязательно) | 1 | Мгновенно (последнее или дефолтное) | **Да** |
| **`ReplaySubject`** | Нет | Настраиваемый ($N$) | Мгновенно (проигрывает всю историю из $N$ записей) | Нет |
| **`AsyncSubject`** | Нет | 1 | Только после вызова `complete()` | Нет |

---

### 2. Физика утечек памяти в `ReplaySubject`
`ReplaySubject` — мощный, но потенциально опасный инструмент. 

Если вы объявите:
```typescript
const stream$ = new ReplaySubject<HeavyObject>(); // Без указания лимита буфера!
```
`ReplaySubject` будет бесконечно сохранять в массив в куче (`Heap`) абсолютно каждое испущенное значение. Если поток работает долго и прокачивает через себя тысячи объектов, память вкладки будет непрерывно расти, пока приложение не упадет с ошибкой `Out of Memory`.

**Правило:** Всегда явно задавайте размер буфера `new ReplaySubject(1)` или окно жизни `new ReplaySubject(50, 5000)`.

---

### 3. Типичные ошибки и их решение

*   **Ошибка 1: Забытый вызов `complete()` в `AsyncSubject`**
    *   *Симптомы:* Метод `.subscribe()` на `AsyncSubject` никогда не срабатывает, данные не отображаются, приложение бесконечно висит в режиме ожидания.
    *   *Физика процесса:* По спецификации `AsyncSubject` ждет завершения всего потока. Если не вызвать `.complete()`, он считает, что поток еще может испустить более свежее значение, и блокирует отправку данных.
    *   *Решение:* Всегда вызывайте `.complete()` сразу после `.next()` при работе с `AsyncSubject`.

*   **Ошибка 2: Нарушение инкапсуляции (Экспорт сырого Subject)**
    *   *Симптомы:* Внешние компоненты вызывают `.next()` на сервисе, ломая целостность состояния.
    *   *Решение:* Делайте Subject приватным (`private readonly state$`), а наружу отдавайте только `state$.asObservable()`.

*   **Ошибка 3: Использование `BehaviorSubject` там, где нет валидного дефолтного значения**
    *   *Симптомы:* Приходится инициализировать `BehaviorSubject<User | null>(null)` и писать проверки на `null` по всей кодовой базе.
    *   *Решение:* Если у сущности нет начального значения до первого ответа сервера, используйте `ReplaySubject(1)` вместо `BehaviorSubject`. Он не требует начального значения и сработает только тогда, когда реальные данные действительно поступят.
