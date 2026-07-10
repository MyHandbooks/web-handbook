---
tags: [ts, типизация-typescript, утилиты-типов]
related: ["[[Безопасная работа с типом unknown.md]]", "[[Выборка свойств из интерфейса (Pick).md]]"]
status: "completed"
---

# Конструирование DTO (Partial, Omit)

## БЫСТРЫЙ СТАРТ

*   **DTO (Data Transfer Object)** — это объект переноса данных, определяющий структуру информации при сетевом обмене (API-запросы, PATCH-обновления, POST-создание сущностей) без прямого использования тяжелых доменных моделей базы данных.
*   **`Partial<T>`** — встроенная утилита типов, создающая новый тип, где все свойства исходного типа `T` становятся необязательными (добавляется модификатор `?`). Идеально подходит для описания тел PATCH-запросов.
*   **`Omit<T, K>`** — утилита, конструирующая тип путем удаления указанного набора ключей `K` (строковый литерал или Union) из исходного типа `T`. Крайне полезна при создании сущностей, когда системные поля (`id`, `createdAt`, `updatedAt`) генерируются сервером и не должны передаваться с клиента.
*   **Используйте их для:** декомпозиции и переиспользования единого базового интерфейса сущности при проектировании клиент-серверного взаимодействия без дублирования кода.
*   **Не используйте их:** для глубоких (Nested) преобразований объектов. Стандартные `Partial` и `Omit` работают только на первом уровне вложенности (shallow).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Конструирование PATCH-тела запроса через `Partial<T>`
*   **Назначение:** Описание типа для частичного обновления сущности на сервере, где клиент может отправить произвольный набор полей для изменения.

```typescript
export interface BaseEntity {
  identifier: string;
  displayName: string;
  resourceCount: number;
  isActive: boolean;
}

// Конструируем DTO для частичного обновления. Все поля BaseEntity становятся опциональными
export type UpdatePayloadDto = Partial<BaseEntity>;

// Пример функции отправки PATCH-запроса
export function updateEntity(
  id: string, 
  payload: UpdatePayloadDto
): void {
  // payload может содержать только { displayName: "Новое имя" } или быть пустым.
  // Попытка передать несуществующее свойство пресекается компилятором TS.
  console.log(`Обновление сущности ${id} следующими данными:`, payload);
}
```

---

### Шаблон 2: Исключение серверных полей при создании сущности через `Omit<T, K>`
*   **Назначение:** Формирование структуры данных для POST-запроса, исключающей поля, которые генерируются исключительно базой данных или сервером.

```typescript
export interface UserRecord {
  id: string;          // Генерируется сервером (UUID)
  email: string;       // Передается клиентом
  username: string;    // Передается клиентом
  createdAt: string;   // Генерируется сервером (timestamp)
  updatedAt: string;   // Генерируется сервером (timestamp)
}

// Создаем DTO для регистрации, исключая автогенерируемые сервером поля
export type CreationPayloadDto = Omit<UserRecord, "id" | "createdAt" | "updatedAt">;

// Пример функции создания пользователя
export function createUser(payload: CreationPayloadDto): void {
  // Попытка передать в payload свойство 'id' или 'createdAt' вызовет ошибку компиляции TS
  const requestBody: CreationPayloadDto = {
    email: payload.email.trim().toLowerCase(),
    username: payload.username
  };

  console.log("Отправка запроса на регистрацию пользователя:", requestBody);
}
```

---

### Шаблон 3: Комбинированное DTO (Сочетание Partial и Omit)
*   **Назначение:** Создание сложного DTO, где часть полей полностью вырезается из типа, а оставшиеся поля переводятся в разряд необязательных.

```typescript
export interface TaskDetails {
  id: string;
  title: string;
  description: string;
  isCompleted: boolean;
  assignedUserId: string;
}

// Создаем тип, где исключаем уникальный системный ID, а все остальные свойства делаем необязательными
// Сначала убираем 'id' с помощью Omit, а затем оборачиваем результат в Partial
export type TaskUpdateDto = Partial<Omit<TaskDetails, "id">>;

// Альтернативный вариант: Оборачиваем весь интерфейс в Partial, а затем вырезаем 'id', 
// чтобы гарантировать, что даже опциональный 'id' невозможно будет передать в метод обновления
export type StrictTaskUpdateDto = Omit<Partial<TaskDetails>, "id">;

export function patchTask(taskId: string, fieldsToUpdate: StrictTaskUpdateDto): void {
  // taskId передается строго параметром пути URL, а fieldsToUpdate содержит только изменяемые поля задачи
  console.log(`Обновление задачи ${taskId}:`, fieldsToUpdate);
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Внутренний механизм Mapped Types под капотом `Partial<T>`
Утилита `Partial` реализована в стандартной библиотеке TypeScript (файл `lib.es5.d.ts`) на основе механизма **сопоставления типов (Mapped Types)**.

Ее сигнатура выглядит следующим образом:
```typescript
type Partial<T> = {
    [P in keyof T]?: T[P];
};
```
*   `keyof T` — оператор получения типов ключей (Index Type Query), возвращающий Union строковых литералов (например, `"identifier" | "displayName" | "resourceCount" | "isActive"`).
*   `P in keyof T` — итератор по полученному множеству ключей. На каждой итерации `P` принимает значение конкретного ключа.
*   `?:` — модификатор сопоставления, который добавляет флаг необязательности к свойству.
*   `T[P]` — обращение к типу оригинального свойства по ключу `P` (Indexed Access Type).

Таким образом, компилятор производит полную поверхностную копию структуры, помечая каждую запись как опциональную.

### 2. Внутренний механизм Conditional Types под капотом `Omit<T, K>`
Реализация `Omit` устроена сложнее и задействует вспомогательные утилиты `Pick` и `Exclude`:
```typescript
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;
```
*   `keyof T` возвращает список всех ключей типа `T`.
*   `Exclude<keyof T, K>` на основе **дистрибутивных условных типов (Conditional Types)** вычитает из множества ключей `keyof T` те ключи, которые перечислены в `K`.
*   `Pick<T, NewKeys>` конструирует итоговый тип, забирая из исходного `T` только те ключи, которые остались после работы `Exclude`.

Это поверхностная операция. Если вы попытаетесь исключить свойство из вложенного объекта, например `Omit<BaseEntity, 'nested.property'>`, TypeScript не сможет распарсить путь, так как ключи проверяются строго по первому уровню иерархии.

### 3. Детальный пошаговый разбор комбинированного шаблона (StrictTaskUpdateDto)
Разберем последовательность вычислений компилятором выражения `Omit<Partial<TaskDetails>, "id">`:
1.  **Вычисление внутренней части (`Partial<TaskDetails>`):**
    Компилятор трансформирует интерфейс `TaskDetails` в промежуточный анонимный тип, где все свойства опциональны:
    ```typescript
    type TempTaskDetails = {
      id?: string;
      title?: string;
      description?: string;
      isCompleted?: boolean;
      assignedUserId?: string;
    }
    ```
2.  **Вычисление внешней части (`Omit<TempTaskDetails, "id">`):**
    *   `keyof TempTaskDetails` возвращает union: `"id" | "title" | "description" | "isCompleted" | "assignedUserId"`.
    *   `Exclude<...>` вычитает `"id"` из этого union-типа. В остатке получаем: `"title" | "description" | "isCompleted" | "assignedUserId"`.
    *   `Pick<...>` собирает итоговый тип только из оставшихся ключей.
3.  **Итоговый результат `StrictTaskUpdateDto`:**
    ```typescript
    type StrictTaskUpdateDto = {
      title?: string;
      description?: string;
      isCompleted?: boolean;
      assignedUserId?: string;
    }
    ```
    Свойство `id` полностью стерто из результирующего типа.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Опечатки в исключаемых ключах внутри `Omit`**
    *   *Проблема:* При передаче строкового литерала в `Omit` разработчик допускает опечатку или удаляет свойство из базового интерфейса, но забывает обновить вызов `Omit`. В старых версиях TS или при слабой конфигурации компилятора это проходит незамеченным, создавая скрытый баг.
    *   *Решение:* По умолчанию стандартный `Omit` принимает любые строки в качестве второго аргумента (`keyof any`). Чтобы сделать валидацию ключей строгой, можно объявить собственную утилиту `StrictOmit`:

```typescript
// Обычный Omit позволяет написать некорректный ключ:
type BadDto = Omit<BaseEntity, "nonExistentKey">; // Ошибки компиляции не будет!

// Кастомная утилита StrictOmit требует, чтобы исключаемые ключи строго наследовались от keyof T
export type StrictOmit<T, K extends keyof T> = Omit<T, K>;

// Теперь компилятор немедленно подсветит ошибку:
// type GoodDto = StrictOmit<BaseEntity, "nonExistentKey">; 
// ! Ошибка: Type '"nonExistentKey"' does not satisfy the constraint 'keyof BaseEntity'.
```

*   **Ошибка 2: Чрезмерное использование `Partial` при валидации полей форм**
    *   *Проблема:* Разработчик типизирует форму создания сущности как `Partial<Entity>`, из-за чего компилятор считает все поля опциональными. При отправке формы на сервер обязательные поля (например, `title` или `email`) могут оказаться `undefined`, что приведет к ошибкам в рантайме.
    *   *Решение:* Не подменяйте строгие типы ввода формы на `Partial`. Опишите DTO отправки формы явно с помощью `Omit` (чтобы вырезать системные поля), оставив бизнес-поля строго обязательными.

*   **Ошибка 3: Опасный кастинг (Type Assertion) при приведении к DTO**
    *   *Проблема:* Разработчик обходит компилятор с помощью небезопасного кастинга `const data = rawData as UpdatePayloadDto`. Если в `rawData` будут находиться посторонние или вредоносные свойства, они попадут в результирующий объект и будут отправлены по сети, нарушая безопасность контракта API.
    *   *Решение:* Применяйте явный маппинг полей или пишите защитники типов (Type Guards) вместо слепого принудительного приведения типов `as`.

```typescript
// ПЛОХО (Слепой кастинг. Лишние свойства из rawInput попадут в сетевой запрос)
export function preparePayloadUnsafe(rawInput: any): UpdatePayloadDto {
  return rawInput as UpdatePayloadDto; 
}

// ХОРОШО (Явное конструирование объекта гарантирует чистоту DTO-модели)
export function preparePayloadSafe(rawInput: Record<string, unknown>): UpdatePayloadDto {
  const payload: UpdatePayloadDto = {};
  
  if (typeof rawInput["displayName"] === "string") {
    payload.displayName = rawInput["displayName"];
  }
  if (typeof rawInput["isActive"] === "boolean") {
    payload.isActive = rawInput["isActive"];
  }
  
  return payload;
}
```