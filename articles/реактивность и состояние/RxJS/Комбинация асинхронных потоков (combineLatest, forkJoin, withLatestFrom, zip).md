---
tags: [angular, RxJS, архитектура]
related: ["[[Анатомия конвейера pipe и базовые операторы обработки (map, filter, tap).md]]", "[[Преобразования RxJS потоков (switchMap, concatMap).md]]"]
status: "completed"
---

# Комбинация асинхронных потоков (combineLatest, forkJoin, withLatestFrom, zip)

## БЫСТРЫЙ СТАРТ

*   **Операторы комбинации** объединяют несколько независимых реактивных источников данных в один результирующий поток. Выбор неверного оператора — частая причина зависания интерфейса и паразитных сетевых запросов.
*   **Четыре фундаментальных оператора:**
    *   `combineLatest([a, b, ...])` — испускает новое событие каждый раз, когда меняется **любой** из входящих потоков (но строго *после* того, как каждый поток испустил хотя бы по одному начальному значению). Возвращает массив или объект с самыми свежими значениями всех участников. Используется для живой фильтрации и реактивных зависимостей.
    *   `forkJoin([a, b, ...])` — аналог `Promise.all`. Ждет, пока **абсолютно все** входящие потоки перейдут в состояние завершения (`complete`), и только тогда испускает один финальный массив их последних значений. Если один из потоков падает с ошибкой, вся цепочка падает мгновенно. Используется для параллельных независимых HTTP GET-запросов.
    *   `withLatestFrom(other$)` — оператор экземпляра. Пропускает события основного потока, молча прикрепляя к ним последнее значение из вспомогательного потока `other$`. При этом изменения самого `other$` **не вызывают** генерацию новых событий в цепочке. Используется для прокидывания токенов авторизации или конфигураций в момент отправки форм.
    *   `zip([a, b, ...])` — строго сопоставляет значения по порядковому индексу (первый с первым, второй со вторым). Поток заблокирован до тех пор, пока каждый участник не выработает значение для текущего шага. Используется для пошаговой синхронизации данных.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Реактивная многопараметрическая фильтрация (`combineLatest`)
*   **Назначение:** Автоматический перезапуск поиска товаров на сервере при изменении любого из фильтров: текста поиска или выбранной категории.

#### 1. Файл логики: `product-search.ts`
```typescript
import { Component, inject, OnInit, signal, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, combineLatest, Observable, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';

@Component({
  selector: 'app-product-search',
  // standalone: true опускается по умолчанию начиная с v19
  imports: [
    ReactiveFormsModule // Импортируем модуль форм для работы с searchControl
  ],
  templateUrl: './product-search.html',
  styleUrl: './product-search.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductSearch implements OnInit { // Имя класса очищено от суффикса Component
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  // Контрол поисковой строки
  public readonly searchControl = new FormControl<string>('', { nonNullable: true });
  
  // Горячий поток выбранной категории
  public readonly activeCategory$ = new BehaviorSubject<string>('all');

  public readonly results = signal<string[]>([]);

  public ngOnInit(): void {
    // Декларативно объединяем потоки параметров
    combineLatest([
      this.searchControl.valueChanges.pipe(
        debounceTime(300),          // Защита от дребезга при вводе букв
        distinctUntilChanged()     // Игнорируем дубли
      ),
      this.activeCategory$
    ]).pipe(
      // switchMap переключит сетевой запрос при изменении любого параметра.
      // На вход передается строго типизированный кортеж [query, category]
      switchMap(([query, category]) => {
        let params = new HttpParams();
        if (query.trim()) params = params.set('q', query.trim());
        if (category !== 'all') params = params.set('cat', category);

        return this.http.get<string[]>('/api/v1/products', { params }).pipe(
          catchError(() => of([])) // Изолируем ошибки сети
        );
      }),
      // Гарантируем чистую выгрузку подписок при уничтожении
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((data) => this.results.set(data));
  }
}
```

#### 2. Файл разметки: `product-search.html`
```html
<div class="search-panel">
  <input type="text" [formControl]="searchControl" placeholder="Поиск по названию..." class="theme-input" />
  
  <ul class="results-list">
    @for (product of results(); track product) {
      <li>{{ product }}</li>
    } @empty {
      <li>Товары не найдены</li>
    }
  </ul>
</div>
```

#### 3. Файл стилей: `product-search.css`
```css
.search-panel {
  padding: 16px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.results-list {
  margin-top: 12px;
  padding-left: 20px;
}
```

---

### Шаблон 2: Параллельная загрузка независимых словарей (`forkJoin`)
*   **Назначение:** Одновременный запуск трех независимых GET-запросов справочников при старте приложения с получением единого структурированного ответа.

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

export interface AppMetadata {
  countries: string[];
  currencies: string[];
  systemStatus: string;
}

@Injectable({
  providedIn: 'root'
})
export class MetadataService {
  private readonly http = inject(HttpClient);

  public loadAppMetadata(): Observable<AppMetadata> {
    // forkJoin принимает словарь или массив холодных потоков HttpClient
    return forkJoin({
      countries: this.http.get<string[]>('/api/countries').pipe(catchError(() => of([]))),
      currencies: this.http.get<string[]>('/api/currencies').pipe(catchError(() => of([]))),
      systemStatus: this.http.get<{ status: string }>('/api/status').pipe(
        map(res => res.status),
        catchError(() => of('offline'))
      )
    });
  }
}
```

---

### Шаблон 3: Прокидывание токена сессии в триггер отправки формы (`withLatestFrom`)
*   **Назначение:** Добавление актуального значения JWT-токена из Auth-сервиса в тело запроса при клике на кнопку «Сохранить» без постоянного прослушивания изменений токена.

#### 1. Файл логики: `submit-form.ts`
```typescript
import { Component, inject, OnInit, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { Subject } from 'rxjs';
import { withLatestFrom, map } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-submit-form',
  imports: [],
  templateUrl: './submit-form.html',
  styleUrl: './submit-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SubmitForm implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  // Поток кликов на кнопку отправки
  private readonly submitClicks$ = new Subject<void>();

  public ngOnInit(): void {
    this.submitClicks$.pipe(
      // При клике забираем последнее актуальное состояние токена из Auth-сервиса.
      // Изменение самого authState$ не вызовет ложных отправлений формы!
      withLatestFrom(this.auth.authState$),
      
      // На вход получаем кортеж [void, tokenValue]
      map(([_, token]) => {
        return {
          reportData: { title: 'Годовой отчет' },
          authToken: token
        };
      }),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((payload) => this.sendSecurePayload(payload));
  }

  public triggerSubmit(): void {
    this.submitClicks$.next();
  }

  private sendSecurePayload(payload: unknown): void {
    console.log('[Submit] Безопасная отправка пакета:', payload);
  }
}
```

#### 2. Файл разметки: `submit-form.html`
```html
<div class="submit-box">
  <button (click)="triggerSubmit()" class="action-btn">Отправить отчет</button>
</div>
```

#### 3. Файл стилей: `submit-form.css`
```css
.submit-box {
  padding: 12px;
}
.action-btn {
  padding: 10px 20px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Локушка неполной инициализации (The Late Start Trap)
Распространенный баг при использовании `combineLatest` или `zip` — бесконечное зависание потока в состоянии ожидания. 

*   По спецификации, метод `combineLatest` **обязан дождаться хотя бы одной эмиссии от каждого участника**, прежде чем испустить первое общее значение.
*   Если у вас есть 5 комбинируемых потоков, и 4 из них испустили значения мгновенно, а 5-й поток является холодным и молчит (или это пустой `Subject`), `combineLatest` будет вечно находиться в режиме ожидания, полностью блокируя выполнение нижележащей цепочки.

Для предотвращения подобных зависаний на "молчащих" потоках всегда используйте оператор `startWith(null)` или задавайте дефолтные стартовые значения.

### 2. Проблема Diamond Dependency (Глитчи временного состояния)
В реактивных потоках RxJS существует архитектурная уязвимость — глитчи временного состояния. Представьте ромбовидный граф:

```
    [ Поток-источник A ]
         /        \
   [ Стрим Б ]    [ Стрим В ]
         \        /
    [ combineLatest ]
```

Если Поток-источник A испускает значение, он одновременно запускает обновление Стрима Б и Стрима В. Так как RxJS является асинхронно-синхронной проталкивающей системой, `combineLatest` внизу графа может сработать дважды: первый раз, когда обновится Б (но в В еще будет находиться старое значение), и второй раз, когда долетит обновление от В. 

Это создает кратковременное мерцание (глитч) некорректных данных в UI. В отличие от Angular Signals (которые гарантируют glitch-free пересчет по умолчанию за счет Pull-модели), в RxJS для минимизации глитчей приходится использовать принудительное сжатие по времени через `debounceTime(0)`.

### 3. Физика завершения работы (Propagation of Complete)
Операторы комбинации имеют кардинально разные правила завершения потока:

*   **`forkJoin`:** Ожидает завершения всех источников. Как только последний источник вызывает `complete`, `forkJoin` делает одну финальную эмиссию массива данных и мгновенно завершается сам. Если один из источников бесконечен (например, `BehaviorSubject`), `forkJoin` никогда не вызовет `complete` и не испустит значение.
*   **`combineLatest`:** Будет продолжать жить в памяти до тех пор, пока **все** источники не завершат свою работу. Если завершился только один источник, `combineLatest` продолжает реагировать на изменения оставшихся активных участников.
*   **`zip`:** Завершается мгновенно, как только завершается хотя бы один из источников, так как сопоставление пар по индексам для завершенной ветки больше невозможно.

### 4. Детальный пошаговый разбор выполнения шаблона 2
1.  **Вызов метода:** Запускается `loadAppMetadata()`.
2.  **Инициация forkJoin:** Оператор `forkJoin` подписывается на три сетевых GET-запроса одновременно. Браузер открывает три параллельных сокета.
3.  **Завершение первого:** Запрос `/api/countries` завершается успешно через 100мс. Массив стран сохраняется в буфере `forkJoin`. Этот поток вызывает `complete`.
4.  **Завершение второго:** Запрос `/api/status` падает с ошибкой через 150мс. Оператор `catchError` внутри цепочки перехватывает сбой и возвращает `of('offline')`. Поток успешно гасит ошибку и вызывает `complete`.
5.  **Завершение третьего:** Запрос `/api/currencies` завершается через 250мс. Поток вызывает `complete`.
6.  **Финальная эмиссия:** Все три потока перешли в состояние `complete`. `forkJoin` извлекает данные из буферов, конструирует итоговый объект `AppMetadata` и делает единственную эмиссию в поток.
7.  **Завершение координатора:** Поток `forkJoin` вызывает `complete` и высвобождает память.

---

### 5. Типичные ошибки и их решение

*   **Ошибка 1: Бесконечное зависание `forkJoin` из-за незавершенных источников**
    *   *Симптомы:* Метод `forkJoin` запущен, сетевые запросы прошли успешно, но подписка `.subscribe()` никогда не срабатывает и лоадер бесконечно крутится.
    *   *Причина:* Один из источников в массиве является бесконечным потоком. Например, вы передали в `forkJoin` ссылку на `BehaviorSubject` из сервиса состояния или на событие клика кнопки. Поскольку эти источники никогда самостоятельно не завершаются (не вызывают `complete`), `forkJoin` продолжает вечно ожидать их финала.
    *   *Решение:* Принудительно ограничивайте время жизни бесконечных источников с помощью оператора `take(1)` или `first()` перед передачей в `forkJoin`.

```typescript
// ПЛОХО (BehaviorSubject никогда не завершится, forkJoin зависнет навсегда)
// return forkJoin([this.http.get('/api'), this.myBehaviorSubject$]);

// ХОРОШО (take(1) принудительно вызовет complete после первой же эмиссии значения)
@Injectable({ providedIn: 'root' })
export class SafeMetadataService {
  private readonly http = inject(HttpClient);
  private readonly myBehaviorSubject$ = new BehaviorSubject<string>('default');

  public load(): Observable<unknown> {
    return forkJoin([
      this.http.get('/api'),
      this.myBehaviorSubject$.pipe(take(1)) // Успешно вызовет complete
    ]);
  }
}
```

*   **Ошибка 2: Смерть всего `forkJoin` при падении одного из запросов**
    *   *Симптомы:* Вы запускаете параллельную загрузку трех словарей. Один второстепенный словарь упал с ошибкой `404`, после чего вся страница падает с ошибкой, и даже успешно загруженные данные двух других словарей не отображаются.
    *   *Причина:* По спецификации `forkJoin` работает по принципу "всё или ничего". Любая необработанная ошибка любого из участников мгновенно прерывает выполнение всего комбинатора, отбрасывая результаты успешных запросов.
    *   *Решение:* Всегда изолируйте и гасите сетевые ошибки через `catchError` внутри трубы *каждого* индивидуального запроса до его передачи в `forkJoin` (как показано в Шаблоне 2).

```typescript
// ПЛОХО (Любая сетевая ошибка убьет всю цепочку forkJoin)
// return forkJoin([http.get('/a'), http.get('/b')]);

// ХОРОШО (Ошибка локализована, возвращен безопасный fallback-объект)
return forkJoin([
  http.get('/a').pipe(catchError(() => of([]))),
  http.get('/b').pipe(catchError(() => of([])))
]);
```

*   **Ошибка 3: Использование `combineLatest` вместо `withLatestFrom` для событийных триггеров**
    *   *Симптомы:* Форма отправляется на сервер самопроизвольно каждый раз, когда пользователь заходит в систему, или когда обновляется токен авторизации в фоновом сервисе.
    *   *Причина:* Разработчик объединил клик кнопки отправки формы и поток токена через `combineLatest`. По спецификации, как только токен авторизации обновится в фоне (например, сработал беззвучный silent-refresh), `combineLatest` зафиксирует изменение одного из источников и мгновенно сгенерирует новое событие отправки формы без клика пользователя.
    *   *Решение:* Если событие должно инициироваться строго одним триггером (кликом), а второй поток нужен лишь как пассивный поставщик дополнительных данных, всегда используйте оператор экземпляра `withLatestFrom` (как показано в Шаблоне 3).