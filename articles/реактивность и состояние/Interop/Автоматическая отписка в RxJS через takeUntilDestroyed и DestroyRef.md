---
tags: [angular, RxJS, архитектура]
related: ["[[Преобразование потока в сигнал (toSignal).md]]", "[[Преобразование сигнала в поток (toObservable).md]]"]
status: "completed"
---

# Автоматическая отписка в RxJS через takeUntilDestroyed и DestroyRef

## БЫСТРЫЙ СТАРТ

*   **Оператор `takeUntilDestroyed()`** — специализированный оператор из пакета `@angular/core/rxjs-interop`, который автоматически завершает поток RxJS `Observable` (вызывает отписку), когда уничтожается содержащий его контекст (компонент, директива или служба).
*   **Служба `DestroyRef`** — встроенный провайдер Angular (начиная с Angular 16), представляющий собой программный интерфейс для регистрации коллбэков очистки ресурсов (`onDestroy()`). Он является современной, чистой заменой классического метода жизненного цикла класса `ngOnDestroy()`.
*   **Правила контекста выполнения:**
    *   Если `takeUntilDestroyed()` вызывается в **контексте внедрения зависимостей** (Injection Context) — например, в конструкторе или при объявлении свойств класса, — он автоматически находит активный `DestroyRef` и не требует передачи аргументов.
    *   Если оператор вызывается **вне контекста внедрения** (в обычных методах класса или хуках жизненного цикла вроде `ngOnInit`), необходимо внедрить `DestroyRef` и явно передать его в качестве аргумента: `takeUntilDestroyed(this.destroyRef)`.
*   **Используйте:** Для любых ручных подписок `.subscribe()` в классах компонентов или служб, чтобы полностью исключить утечки памяти без написания громоздкого шаблонного кода с ручным вызовом `ngOnDestroy`.

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Авто-отписка внутри конструктора (Контекст внедрения)
*   **Назначение:** Описание простейшей и самой частой подписки на поток событий внутри конструктора с автоматическим завершением при уходе пользователя с экрана.

```typescript
import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';

@Component({
  selector: 'app-auto-unsubscriber',
  standalone: true,
  template: `<p>Компонент фонового мониторинга активен</p>`
})
export class AutoUnsubscriberComponent {
  private readonly http = inject(HttpClient);

  constructor() {
    // Каждые 5 секунд запускаем фоновую задачу
    interval(5000).pipe(
      // Подключаем оператор. Так как вызов происходит внутри конструктора,
      // Angular автоматически найдет ссылку на DestroyRef этого компонента.
      // Нам не нужно ничего передавать в аргументы!
      takeUntilDestroyed()
    ).subscribe({
      next: (tick) => this.performBackgroundPoll(tick),
      complete: () => console.log('[RxJS Interop] Поток интервала успешно и безопасно завершен.')
    });
  }

  private performBackgroundPoll(tick: number): void {
    console.log(`[Poll] Итерация №${tick}. Запрашиваем состояние системы...`);
  }
}
```

---

### Шаблон 2: Авто-отписка внутри ngOnInit (Явная передача DestroyRef)
*   **Назначение:** Подписка на поток внутри стандартного хука `ngOnInit`. Требует предварительного внедрения `DestroyRef` и его ручной передачи в оператор.

```typescript
import { Component, inject, OnInit, DestroyRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-route-watcher',
  standalone: true,
  template: `<p>Мониторинг параметров роута активен</p>`
})
export class RouteWatcherComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  
  // Внедряем глобальную службу DestroyRef текущего компонента
  private readonly destroyRef = inject(DestroyRef);

  public ngOnInit(): void {
    // Подписываемся на изменение параметров роута внутри ngOnInit
    this.route.params.pipe(
      // Так как ngOnInit выполняется ВНЕ контекста внедрения (Injection Context),
      // мы ОБЯЗАНЫ явно передать ссылку на destroyRef в качестве аргумента.
      // Без этого Angular выбросит ошибку компиляции или рантайма.
      takeUntilDestroyed(this.destroyRef)
    ).subscribe({
      next: (params) => console.log('[Router] Получены новые параметры:', params),
      complete: () => console.log('[Router] Наблюдение за параметрами роута успешно завершено.')
    });
  }
}
```

---

### Шаблон 3: Программная очистка ресурсов через DestroyRef.onDestroy
*   **Назначение:** Регистрация кастомного коллбэка уничтожения для сторонних библиотек, слушателей событий или таймеров без объявления в классе метода `ngOnDestroy`.

```typescript
import { Component, inject, ElementRef, OnInit, DestroyRef } from '@angular/core';

@Component({
  selector: 'app-canvas-painter',
  standalone: true,
  template: `<canvas #paintCanvas width="400" height="300"></canvas>`
})
export class CanvasPainterComponent implements OnInit {
  private readonly hostElement = inject(ElementRef);
  private readonly destroyRef = inject(DestroyRef);

  public ngOnInit(): void {
    const canvas = this.hostElement.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    
    // Инициализируем сторонний тяжелый плагин или вешаем нативный обработчик
    const resizeHandler = () => {
      console.log('[Canvas] Пересчитываем размеры холста...');
    };
    window.addEventListener('resize', resizeHandler);

    // Регистрируем коллбэк очистки ресурсов напрямую в DestroyRef.
    // Нам больше не нужно писать "implements OnDestroy" и объявлять метод ngOnDestroy() в классе!
    this.destroyRef.onDestroy(() => {
      console.warn('[DestroyRef] Компонент уничтожается. Очищаем нативные слушатели событий.');
      window.removeEventListener('resize', resizeHandler);
    });
  }
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Смерть классического Subject-паттерна отписок
До появления Angular 16 и утилиты `takeUntilDestroyed` стандартным enterprise-подходом для предотвращения утечек памяти было создание ручной схемы отписки с использованием `Subject`:

```typescript
// УСТАРЕВШИЙ И ГРОМОЗДКИЙ ПОДХОД (BOILERPLATE)
@Component({...})
export class OldComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  ngOnInit() {
    myStream$.pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete(); // Легко забыть написать или перепутать порядок
  }
}
```

Почему эта схема была хрупкой?
*   **Высокий риск человеческой ошибки:** Разработчики регулярно забывали вызвать `.next()` или `.complete()` в `ngOnDestroy`, оставляя сокеты и интервалы активными в фоновом режиме.
*   **Лишний мусор в кодовой базе:** Объявление интерфейса `OnDestroy`, создание системного приватного свойства `destroy$`, написание обязательного метода `ngOnDestroy` — всё это раздувало кодовую базу компонента на десятки строк бессмысленного шаблонного кода.

`takeUntilDestroyed` полностью искореняет этот бойлерплейт, решая задачу декларативно в одну строку.

### 2. Как устроен takeUntilDestroyed под капотом
Давайте разберем низкоуровневую механику работы оператора:

1.  **Поиск контекста внедрения:** При вызове `takeUntilDestroyed()` без параметров утилита использует внутренний метод Angular `inject(DestroyRef)` для получения ссылки на активный `DestroyRef` из текущего Injection Context.
2.  **Создание внутреннего триггера:** Внутри оператора создается приватный горячий поток `Subject<void>`.
3.  **Регистрация уничтожения:** Утилита регистрирует подписку на уничтожение:
    ```typescript
    destroyRef.onDestroy(() => {
      destroySubject.next();
      destroySubject.complete(); // Триггерим завершение потока при деструкте
    });
    ```
4.  **Связывание с исходным потоком:** Возвращается стандартный RxJS-оператор `takeUntil(destroySubject)`, который и завершает ваш сетевой поток, когда срабатывает триггер.

### 3. Пошаговый разбор жизненного цикла авто-отписки
Проследим шаги утилизации потока в `AutoUnsubscriberComponent` (Шаблон 1) при уходе пользователя со страницы:

1.  **Создание:** Пользователь заходит на страницу. Конструктор вызывает `takeUntilDestroyed()`. Angular находит `DestroyRef` компонента и регистрирует в нем коллбэк отписки. Поток `interval(5000)` начинает генерировать события каждые 5 секунд.
2.  **Жизненный цикл:** Пользователь находится на странице, события опроса выполняются штатно.
3.  **Разрушение:** Пользователь переходит на другую страницу. Маршрутизатор Angular запускает уничтожение компонента.
4.  **Срабатывание триггера:** Аппаратный деструктор Angular вызывает метод `destroy()` компонента, который поочередно запускает все зарегистрированные в `DestroyRef` коллбэки `onDestroy()`.
5.  **Отписка:** Коллбэк внутри `takeUntilDestroyed` генерирует событие завершения во внутренний `Subject`. Ваш поток `interval` получает сигнал complete, отписывается от нативного таймера браузера и полностью уничтожается в оперативной памяти.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Неверное положение takeUntilDestroyed в цепочке операторов (Inner Leak Bug)**
    *   *Симптомы:* Поток внешне завершается, но внутренние сетевые запросы внутри операторов высшего порядка (например, `switchMap`) продолжают тайно выполняться в фоне после ухода пользователя со страницы.
    *   *Физика процесса:* Разработчик разместил `takeUntilDestroyed` в середине трубы до операторов трансформации. Из-за этого при деструкте отписка происходит от внешнего потока, а внутренний поток (созданный `switchMap` или `concatMap`) остается жить своей жизнью.
    *   *Решение:* По общему золотому правилу RxJS, операторы управления жизненным циклом (такие как `takeUntil`, `take(1)`, `takeUntilDestroyed`) должны всегда находиться **самыми последними** в цепочке операторов `pipe()`, непосредственно перед вызовом метода `.subscribe()`.

```typescript
// ОШИБКА: switchMap может породить внутреннюю утечку при уничтожении
// return stream$.pipe(
//   takeUntilDestroyed(),
//   switchMap(id => this.http.get(`/data/${id}`)) 
// );

// ИСПРАВЛЕНИЕ: Оператор отписки находится на самом последнем месте
return stream$.pipe(
  switchMap(id => this.http.get(`/data/${id}`)),
  takeUntilDestroyed() // Гарантирует завершение всей цепочки
);
```

*   **Ошибка 2: Вызов takeUntilDestroyed() вне Injection Context без аргументов**
    *   *Симптомы:* Ошибка компиляции или рантайм-сбой вида `NG0203: inject() can only be used within an active injection context`.
    *   *Физика процесса:* Разработчик вызвал оператор без параметров внутри обычного метода класса: `loadData() { myStream$.pipe(takeUntilDestroyed()).subscribe(); }`. Так как в этот момент контекст внедрения зависимостей уже закрыт, `takeUntilDestroyed` не может неявно вызвать `inject(DestroyRef)` и падает.
    *   *Решение:* Если вызов происходит вне конструктора или объявления полей класса, обязательно внедрите `DestroyRef` через `inject()` на уровне класса и передайте его в аргументы оператора явно (как в Шаблоне 2).

```typescript
// ОШИБКА: Вызов в методе класса без параметров завершится сбоем
// public load() { this.data$.pipe(takeUntilDestroyed()).subscribe(); }

// ИСПРАВЛЕНИЕ: Внедрение и явная передача ссылки на DestroyRef
private readonly destroyRef = inject(DestroyRef);
public load() {
  this.data$.pipe(
    takeUntilDestroyed(this.destroyRef) // Успешно
  ).subscribe();
}
```

*   **Ошибка 3: Использование takeUntilDestroyed в глобальных синглтон-сервисах**
    *   *Симптомы:* Специфические баги, когда подписка в глобальном сервисе неожиданно завершается или, наоборот, никогда не отписывается, хотя связанные компоненты уже уничтожены.
    *   *Физика процесса:* Глобальный сервис с конфигурацией `providedIn: 'root'` создается один раз при старте приложения и уничтожается только при закрытии вкладки браузера. Использование `takeUntilDestroyed` в конструкторе такого сервиса привяжет отписку к времени жизни самого сервиса (то есть к закрытию приложения), что делает его вызов абсолютно бесполезным, так как локальные компоненты будут плодить утечки памяти, если сервис подписывается на их локальные события.
    *   *Решение:* Используйте `takeUntilDestroyed` только для потоков, время жизни которых жестко коррелирует со временем жизни содержащего их класса (компонента, директивы или локального сервиса компонента). Для глобальных синглтонов управляйте отписками через явное завершение потоков при выходе из системы или используйте реактивные Signals.