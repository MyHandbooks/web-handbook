---
tags: [angular, тестирование, unit-test]
related: ["[[Тестирование рендеринга и кликов (Component Test).md]]"]
status: "completed"
---

# Тестирование изолированного сервиса (Unit Test)

## БЫСТРЫЙ СТАРТ

*   **Изолированный модульный тест (Unit Test) сервиса** — это проверка логики отдельного класса-службы в полной изоляции от внешнего мира (серверов, баз данных, DOM-дерева браузера и других зависимых сервисов).
*   **Использование Заглушек (Mocks / Spies):** Все внешние зависимости тестируемого сервиса (например, HTTP-клиент или смежные службы) принудительно заменяются легкими контролируемыми заглушками (Jasmine Spies) для изоляции тестируемого кода.
*   **Тестирование реактивных Сигналов:** Модульные тесты современных Angular-служб должны проверять не только возвращаемые значения функций, но и правильность обновления реактивного сигнального состояния (`signal` и `computed`).
*   **Используйте:** Для тестирования чистой бизнес-логики: математических вычислений, валидации данных, обработки массивов, управления состоянием корзины или авторизации.
*   **Не используйте:** Для проверки отображения элементов в HTML-шаблоне, отслеживания кликов по кнопкам или проверки CSS-стилей (для этого применяются тесты компонентов `Component Test` или сквозные тесты `E2E`).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Код тестируемого сигнального сервиса корзины (CartManager)
*   **Назначение:** Описание бизнес-логики сервиса корзины покупок, который использует реактивные Сигналы для хранения состояния и зависит от внешнего сервиса проверки промокодов через функциональное внедрение `inject()`.

#### 1. Файлы типов и интерфейсов: `cart-types.ts`
```typescript
export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface PromoValidationResult {
  isValid: boolean;
  discountPercent: number;
}
```

#### 2. Код тестируемого сервиса: `cart-manager.ts`
```typescript
import { Injectable, signal, computed, inject, WritableSignal } from '@angular/core';
import { CartItem, PromoValidationResult } from './cart-types';
import { PromoService } from './promo.service';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CartManager {
  // Функционально внедряем зависимость для проверки промокодов
  private readonly promoService = inject(PromoService);

  // Реактивный список товаров в корзине
  public readonly items: WritableSignal<CartItem[]> = signal<CartItem[]>([]);

  // Текущая примененная скидка в процентах
  public readonly discountPercent = signal<number>(0);

  // Вычисляемый сигнал: общее количество товаров
  public readonly totalQuantity = computed<number>(() => {
    return this.items().reduce((sum, item) => sum + item.quantity, 0);
  });

  // Вычисляемый сигнал: финальная стоимость с учетом скидки
  public readonly totalPrice = computed<number>(() => {
    const basePrice = this.items().reduce((sum, item) => sum + item.price * item.quantity, 0);
    const discountAmount = basePrice * (this.discountPercent() / 100);
    return parseFloat((basePrice - discountAmount).toFixed(2));
  });

  // Метод добавления товара в корзину
  public addItem(newItem: CartItem): void {
    this.items.update(currentItems => {
      const existing = currentItems.find(item => item.id === newItem.id);
      if (existing) {
        return currentItems.map(item => 
          item.id === newItem.id 
            ? { ...item, quantity: item.quantity + newItem.quantity }
            : item
        );
      }
      return [...currentItems, newItem];
    });
  }

  // Метод очистки корзины
  public clearCart(): void {
    this.items.set([]);
    this.discountPercent.set(0);
  }

  // Метод применения промокода (асинхронная операция)
  public applyPromoCode(code: string): Observable<PromoValidationResult> {
    return this.promoService.validateCode(code);
  }
}
```

---

### Шаблон 2: Спек-файл модульного теста на Jasmine (cart-manager.spec.ts)
*   **Назначение:** Полное покрытие тестами логики сервиса `CartManager`: проверка сигналов, добавления товаров, очистки, а также асинхронное тестирование применения промокода с использованием Jasmine Spy.

#### 1. Файл тестов: `cart-manager.spec.ts`
```typescript
import { TestBed } from '@angular/core/testing';
import { CartManager } from './cart-manager';
import { PromoService } from './promo.service';
import { CartItem, PromoValidationResult } from './cart-types';
import { of, throwError } from 'rxjs';

describe('CartManager (Unit Test)', () => {
  let service: CartManager;
  // Переменная для хранения ссылки на заглушку (Spy) зависимого сервиса
  let promoServiceSpy: jasmine.SpyObj<PromoService>;

  beforeEach(() => {
    // 1. Создаем мок-заглушку для PromoService с помощью встроенной утилиты Jasmine
    const spy = jasmine.createSpyObj('PromoService', ['validateCode']);

    // 2. Настраиваем тестовый DI-контейнер Angular
    TestBed.configureTestingModule({
      providers: [
        CartManager,
        // Подменяем реальный PromoService нашей заглушкой spy
        { provide: PromoService, useValue: spy }
      ]
    });

    // 3. Извлекаем инстанции сервисов из тестового инжектора
    service = TestBed.inject(CartManager);
    promoServiceSpy = TestBed.inject(PromoService) as jasmine.SpyObj<PromoService>;
  });

  it('должен успешно инициализироваться с пустой корзиной', () => {
    expect(service.items().length).toBe(0);
    expect(service.totalQuantity()).toBe(0);
    expect(service.totalPrice()).toBe(0);
  });

  it('должен корректно добавлять новые товары в корзину', () => {
    const item: CartItem = { id: 'p-1', name: 'Книга', price: 500, quantity: 1 };
    
    service.addItem(item);

    expect(service.items().length).toBe(1);
    expect(service.totalQuantity()).toBe(1);
    expect(service.totalPrice()).toBe(500);
  });

  it('должен суммировать количество при добавлении дублирующегося товара', () => {
    const item1: CartItem = { id: 'p-1', name: 'Книга', price: 500, quantity: 1 };
    const item2: CartItem = { id: 'p-1', name: 'Книга', price: 500, quantity: 2 };

    service.addItem(item1);
    service.addItem(item2);

    expect(service.items().length).toBe(1); // Количество уникальных позиций
    expect(service.totalQuantity()).toBe(3); // Общее количество
    expect(service.totalPrice()).toBe(1500); // 3 * 500
  });

  it('должен рассчитывать скидку при изменении сигнала discountPercent', () => {
    const item: CartItem = { id: 'p-1', name: 'Книга', price: 1000, quantity: 1 };
    service.addItem(item);

    // Устанавливаем скидку 15% напрямую в сигнал
    service.discountPercent.set(15);

    expect(service.totalPrice()).toBe(850); // 1000 - 150
  });

  it('должен успешно применить валидный промокод (асинхронный тест)', (done: DoneFn) => {
    const mockResult: PromoValidationResult = { isValid: true, discountPercent: 20 };
    // Настраиваем заглушку: при вызове с любым значением вернуть успешный RxJS-поток
    promoServiceSpy.validateCode.and.returnValue(of(mockResult));

    // Вызываем тестируемый метод
    service.applyPromoCode('SALE20').subscribe({
      next: (result) => {
        expect(result.isValid).toBeTrue();
        expect(result.discountPercent).toBe(20);
        
        // Проверяем, что метод-заглушка был вызван ровно один раз с нужным аргументом
        expect(promoServiceSpy.validateCode).toHaveBeenCalledWith('SALE20');
        expect(promoServiceSpy.validateCode).toHaveBeenCalledTimes(1);
        
        done(); // Сигнализируем Jasmine о завершении асинхронного теста
      },
      error: () => {
        fail('Тест не должен был упасть в ветку ошибки');
        done();
      }
    });
  });
});
```

---

### Шаблон 3: Модульный тест чистой изолированной функции вне контекста компонентов
*   **Назначение:** Проверка выполнения изолированной функции, использующей внутренний `inject()`, с помощью ручного создания контекста выполнения `TestBed.runInInjectionContext`.

#### 1. Файл тестируемой функции: `date-formatter.ts`
```typescript
import { inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

// Функция форматирует текущую дату, используя локаль из глобального объекта document
export function formatSystemDate(date: Date): string {
  const doc = inject(DOCUMENT);
  const locale = doc.documentElement.lang || 'ru-RU';
  
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}
```

#### 2. Файл тестов функции: `date-formatter.spec.ts`
```typescript
import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { formatSystemDate } from './date-formatter';

describe('formatSystemDate (Functional Unit Test)', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        // Создаем легковесный мок для DOCUMENT
        {
          provide: DOCUMENT,
          useValue: {
            documentElement: { lang: 'en-US' } // Устанавливаем английскую локаль для теста
          }
        }
      ]
    });
  });

  it('должен отформатировать дату согласно языковым настройкам документа', () => {
    const testDate = new Date(2026, 6, 10); // 10 июля 2026

    // Запускаем функцию строго внутри контекста внедрения TestBed
    const result = TestBed.runInInjectionContext(() => {
      return formatSystemDate(testDate);
    });

    expect(result).toBe('July 10, 2026');
  });
});
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурная физика модульного тестирования служб
Цель Unit-теста — изолировать класс от внешнего окружения. Если ваш сервис делает реальные сетевые HTTP-запросы в базу данных или обращается к нативному API браузера во время выполнения тестов, это порождает три проблемы:

1.  **Нестабильность тестов (Flakiness):**
    Если удаленный сервер упадет или интернет-соединение прервется, тесты на CI/CD упадут с ошибкой, хотя сам код написан абсолютно корректно.
2.  **Низкая скорость выполнения:**
    Реальные HTTP-запросы выполняются сотни миллисекунд. Проект из 1000 тестов будет собираться и проверяться слишком долго. Изолированные тесты с заглушками (Mocks) выполняются за миллисекунды.
3.  **Невозможность проверить пограничные сценарии (Edge Cases):**
    С помощью заглушки вы можете заставить имитируемый сервис мгновенно выдать ошибку `500 Server Error` или таймаут соединения, чтобы проверить, как ваша бизнес-логика отреагирует на аварийную ситуацию. В реальной среде спровоцировать ошибку 500 для теста крайне затруднительно.

### 2. Специфика тестирования сигналов (Signal Assertion)
Сигналы Angular — это функции. При вызове в тестах они возвращают свое текущее значение.

*   **Проверка значений:** Для проверки Writable или Computed сигналов достаточно вызвать их со скобками:
    `expect(service.totalPrice()).toBe(500);`
*   **Изоляция вычислений:** Помните, что `computed` сигналы вычисляются "лениво" (только в момент первого чтения). Когда вы вызываете `addItem()`, Angular не запускает немедленный пересчет `totalPrice()`. Он сделает это только тогда, когда вы вызовете `service.totalPrice()` в теле `expect()`, оптимизируя нагрузку на процессор.

### 3. Детальный пошаговый разбор процесса выполнения асинхронного теста
Проследим шаги Jasmine и Angular TestBed во время выполнения теста промокода (Шаблон 2):

1.  **Инициализация мока:** С помощью `jasmine.createSpyObj` создается объект-заглушка, имитирующий интерфейс `PromoService`.
2.  **Подмена в DI:** TestBed настраивает тестовый модуль, указывая, что при запросе `PromoService` нужно выдать созданный мок.
3.  **Настройка поведения (Mocking):** Строка `promoServiceSpy.validateCode.and.returnValue(of(...))` инструктирует заглушку: «Когда тебя вызовут, не делай реальный сетевой запрос, а мгновенно верни готовый RxJS-поток `of()` с успешным объектом».
4.  **Регистрация колбэка Done:** Тест принимает аргумент `done` (`it('...', (done) => { ... })`). Это сообщает Jasmine, что тест асинхронный, и его нельзя считать успешным сразу после завершения синхронного кода функции.
5.  **Подписка на поток:** Метод `applyPromoCode()` вызывается и возвращает поток. Тест подписывается на него (`.subscribe()`).
6.  **Срабатывание проверщика (Assert):** Код подписки мгновенно получает данные (так как поток `of()` синхронный), сверяет ожидания через `expect()` и вызывает `done()`. Тест официально признается пройденным.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Ошибка NG0203 при тестировании функций с inject()**
    *   *Симптомы:* Тесты падают с критической ошибкой `inject() must be called from an active injection context` при попытке протестировать современную функциональную утилиту или сервис.
    *   *Физика процесса:* Код функции содержит вызов `inject(DOCUMENT)` или другого токена. Если вы попытаетесь вызвать эту функцию в тесте как обычный JS-метод: `const res = formatSystemDate(date);`, Angular выдаст ошибку, так как во время выполнения отсутствовал контекст внедрения зависимостей.
    *   *Решение:* Оберните вызов тестируемой функции в метод `TestBed.runInInjectionContext()`, как детально продемонстрировано в Шаблоне 3.

*   **Ошибка 2: Пропуск асинхронных проверок (Ложноположительные тесты)**
    *   *Симптомы:* Тест пишется как успешный, но если специально написать заведомо ложное утверждение `expect(true).toBeFalse()` внутри подписки `.subscribe()`, тест все равно проходит без ошибок.
    *   *Физика процесса:* Если вы тестируете асинхронный поток (Observable или Promise) и не передали аргумент `done` в тестовую функцию `it()`, Jasmine выполнит синхронный код, увидит конец функции и закроет тест как успешный, даже не дождавшись, пока асинхронный колбэк подписки выполнит свои проверки.
    *   *Решение:* Всегда передавайте аргумент `done: DoneFn` и вызывайте его в самом конце успешной ветки подписки (как показано в Шаблоне 2), либо оборачивайте тесты в утилиту `fakeAsync` и используйте метод `tick()`.

*   **Ошибка 3: Накопление состояния Spies между тестами (Тестовая интерференция)**
    *   *Симптомы:* Первый тест проходит успешно. Второй тест падает с ошибкой, сообщающей, что метод-заглушка был вызван 2 раза вместо 1.
    *   *Физика процесса:* Объект-заглушка `promoServiceSpy` является общим полем для всех тестов внутри блока `describe`. Jasmine сохраняет историю вызовов шпионов (`toHaveBeenCalledWith`) на протяжении всего сеанса, если ее не сбрасывать. История вызовов из первого теста "протекает" во второй, ломая проверки.
    *   *Решение:* Сбрасывайте состояние и историю вызовов шпионов перед каждым тестом внутри хука `beforeEach` или `afterEach` с помощью метода `promoServiceSpy.validateCode.calls.reset()`, либо пересоздавайте объект шпиона заново на каждый тест (как сделано в Шаблоне 2).