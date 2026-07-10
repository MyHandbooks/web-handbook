---
tags: [angular, сигналы, авторизация, безопасность]
related: ["[[Автоматическое обновление токенов (Refresh Token).md]]", "[[Функциональный гард доступа (CanActivate).md]]"]
status: "completed"
---

# Сигнальное хранилище авторизации (Auth Store)

## БЫСТРЫЙ СТАРТ

*   **Сигнальное хранилище авторизации (Auth Store)** — это реактивный сервис совместного использования данных, который управляет сессией пользователя (профиль, JWT-токены, статус авторизации) во всем приложении с помощью Сигналов (`signal` и `computed`).
*   **Единый источник правды:** Использование сигналов гарантирует, что любые изменения в профиле пользователя или его авторизационном статусе будут мгновенно и без задержек спроецированы на все зависимые компоненты, гарды и интерцепторы без необходимости ручных подписок (как в случае с RxJS `BehaviorSubject`).
*   **Используйте:** Для декларативного хранения и изменения состояния авторизации пользователя, проверки прав доступа «на лету» и реактивного скрытия/отображения элементов интерфейса.
*   **Не используйте:** Для долгосрочного фонового кэширования терабайтных данных или файлов (для этого применяются специализированные базы данных на клиенте, такие как IndexedDB).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Сигнальная служба хранения сессии (AuthStore)
*   **Назначение:** Глобальный сервис хранит состояние авторизации, предоставляет вычисляемые свойства (computed-сигналы) для UI-компонентов и инкапсулирует методы входа/выхода.

#### 1. Интерфейс сессии пользователя: `auth-types.ts`
```typescript
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}
```

#### 2. Код сервиса хранилища: `auth-store.ts`
```typescript
import { Injectable, signal, computed, WritableSignal } from '@angular/core';
import { AuthSession, UserProfile } from './auth-types';

@Injectable({
  providedIn: 'root' // Регистрируем сервис в глобальном инжекторе как синглтон
})
export class AuthStore {
  // 1. Приватное реактивное состояние сессии (может быть null, если пользователь гость)
  private readonly session: WritableSignal<AuthSession | null> = signal<AuthSession | null>(null);

  // 2. Публичные сигналы чтения (ReadOnly), доступные компонентам
  public readonly currentSession = this.session.asReadonly();

  // 3. Вычисляемый сигнал статуса авторизации
  public readonly isAuthenticated = computed<boolean>(() => this.session() !== null);

  // 4. Вычисляемый сигнал получения данных профиля
  public readonly userProfile = computed<UserProfile | null>(() => {
    const activeSession = this.session();
    return activeSession ? activeSession.user : null;
  });

  // 5. Вычисляемый сигнал токена доступа для авто-подстановки в интерцептор
  public readonly token = computed<string | null>(() => {
    const activeSession = this.session();
    return activeSession ? activeSession.accessToken : null;
  });

  // Инициализация состояния (например, при старте приложения)
  public initializeSession(savedSession: AuthSession): void {
    this.session.set(savedSession);
  }

  // Метод успешного входа
  public login(newSession: AuthSession): void {
    this.session.set(newSession);
  }

  // Метод выхода из системы
  public logout(): void {
    this.session.set(null);
  }

  // Метод точечного обновления профиля пользователя
  public updateProfile(updatedUser: Partial<UserProfile>): void {
    this.session.update(current => {
      if (!current) return null;
      return {
        ...current,
        user: { ...current.user, ...updatedUser }
      };
    });
  }
}
```

---

### Шаблон 2: Компонент формы авторизации (LoginForm)
*   **Назначение:** Компонент собирает данные учетной записи, инициирует вход через API и записывает успешную сессию в `AuthStore`.

#### 1. Файл логики компонента: `login-form.ts`
```typescript
import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore } from './auth-store';
import { AuthSession } from './auth-types';

@Component({
  selector: 'app-login-form',
  imports: [ReactiveFormsModule],
  templateUrl: './login-form.html',
  styleUrl: './login-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginForm {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  // Сигнал для управления отображением лоадера в кнопке
  public readonly isLoading = signal<boolean>(false);

  // Инициализируем реактивную форму
  public readonly loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  public onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.isLoading.set(true);
    
    // Эмулируем POST-запрос к API авторизации
    setTimeout(() => {
      const mockSession: AuthSession = {
        accessToken: 'mock-jwt-access-token',
        refreshToken: 'mock-jwt-refresh-token',
        user: {
          id: 'usr-991',
          name: 'Алексей',
          email: this.loginForm.controls.email.value,
          role: 'user'
        }
      };

      // Сохраняем сессию в глобальный AuthStore
      this.authStore.login(mockSession);
      this.isLoading.set(false);

      // Перенаправляем пользователя на главную страницу
      this.router.navigate(['/dashboard']);
    }, 1500);
  }
}
```

#### 2. Файл разметки компонента: `login-form.html`
```html
<div class="login-container">
  <h3>Вход в систему</h3>
  
  <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="login-form">
    <label for="email">Электронная почта:</label>
    <input id="email" type="email" formControlName="email" />

    <label for="password">Пароль:</label>
    <input id="password" type="password" formControlName="password" />

    <button type="submit" [disabled]="loginForm.invalid || isLoading()">
      {{ isLoading() ? 'Проверка...' : 'Войти' }}
    </button>
  </form>
</div>
```

#### 3. Файл стилей компонента: `login-form.css`
```css
.login-container {
  padding: 24px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  max-width: 400px;
  margin: 40px auto;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

input {
  padding: 8px 12px;
  background-color: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-normal);
  outline: none;
}

button {
  padding: 10px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

---

### Шаблон 3: Автоматическая синхронизация сессии с LocalStorage через effect()
*   **Назначение:** Расширение `AuthStore` для автоматического сохранения сессии в хранилище браузера при любых изменениях сигнала и её восстановления при старте приложения.

#### 1. Синхронизируемая служба: `auth-persisted-store.ts`
```typescript
import { Injectable, signal, computed, effect, WritableSignal } from '@angular/core';
import { AuthSession, UserProfile } from './auth-types';

@Injectable({
  providedIn: 'root'
})
export class AuthPersistedStore {
  private readonly STORAGE_KEY = 'app_user_session';
  private readonly session: WritableSignal<AuthSession | null>;

  public readonly isAuthenticated;
  public readonly userProfile;

  constructor() {
    // 1. Инициализируем сигнал данными из LocalStorage, если они там есть
    const savedData = localStorage.getItem(this.STORAGE_KEY);
    const initialSession = savedData ? (JSON.parse(savedData) as AuthSession) : null;
    
    this.session = signal<AuthSession | null>(initialSession);

    // 2. Настраиваем вычисляемые свойства
    this.isAuthenticated = computed<boolean>(() => this.session() !== null);
    this.userProfile = computed<UserProfile | null>(() => {
      const active = this.session();
      return active ? active.user : null;
    });

    // 3. Создаем эффект для автоматического сохранения изменений в LocalStorage.
    // Эффект сработает при первой инициализации и при каждой последующей мутации сигнала session!
    effect(() => {
      const activeSession = this.session();
      if (activeSession) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(activeSession));
      } else {
        localStorage.removeItem(this.STORAGE_KEY);
      }
    });
  }

  public login(newSession: AuthSession): void {
    this.session.set(newSession);
  }

  public logout(): void {
    this.session.set(null);
  }
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Архитектурное сравнение: Signals vs RxJS BehaviorSubject для State Management
До появления Сигналов стандартным решением для создания сторов в Angular был паттерн на базе RxJS `BehaviorSubject`.

```typescript
// Классический RxJS Store
private session$ = new BehaviorSubject<AuthSession | null>(null);
public isAuthenticated$ = this.session$.pipe(map(s => !!s));
```

#### Почему Сигналы намного лучше подходят для хранения состояния авторизации?
1.  **Отсутствие ручных отписок:**
    RxJS-потоки требуют подписки (`.subscribe` в коде или `| async` в шаблоне) и обязательной последующей отписки. Забытая отписка от глобального сервиса в компоненте приводит к утечкам памяти. Сигналы не требуют отписок — фреймворк сам выстраивает и уничтожает зависимости в графе реактивности.
2.  **Синхронность без задержек (Glitch-Free):**
    В RxJS сложные комбинации операторов (`combineLatest`, `withLatestFrom`) могут приводить к кратковременным несогласованностям данных (глитчам) во время быстрой смены кадров рендеринга. Сигналы вычисляются синхронно по направленному ациклическому графу реактивности, исключая глитчи.
3.  **Легкое прототипирование без операторов:**
    Вместо сложной цепочки RxJS-операторов для проверки прав администратора:
    `isAdmin$ = user$.pipe(map(u => u?.role === 'admin'))`
    Вы пишите простую декларативную функцию на Сигналах:
    `isAdmin = computed(() => this.userProfile()?.role === 'admin')`

### 2. Принципы атомарности и неизменяемости (Immutability) в Сигналах
При работе с сигнальными хранилищами критически важно соблюдать принцип иммутабельности данных. 

Если вы измените свойство объекта сессии напрямую, Angular не узнает об этом:
```typescript
// ОШИБКА: Мутация объекта напрямую
const user = this.authStore.userProfile();
if (user) {
  user.name = 'Новое Имя'; // Нарушение иммутабельности! Angular не зафиксирует изменение
}
```
*   **Почему это ломает реактивность:** Сигнал хранит ссылку на объект в куче. Если вы измените свойство внутри объекта, ссылка в сигнале останется прежней. Так как ссылка не изменилась, сигнальный граф не запустит пересчет зависимыхcomputed-сигналов и эффектов.
*   **Правильный путь (Update с иммутабельным копированием):**
    Всегда используйте деструктуризацию объекта (spread-оператор `...`) для создания новой ссылки при обновлении, как показано в методе `updateProfile` Шаблона 1.

### 3. Детальный пошаговый разбор фазы выполнения эффекта синхронизации
Проследим шаги работы эффекта в `AuthPersistedStore` (Шаблон 3) при входе пользователя:

1.  **Вызов login():** Компонент вызывает `this.store.login(sessionData)`.
2.  **Обновление сигнала:** Метод `session.set()` записывает новую сессию. Ссылка на объект сессии изменяется.
3.  **Планирование эффекта:** Angular фиксирует изменение сигнала `session`, который является зависимостью внутри зарегистрированного `effect()`. Выполнение эффекта ставится в очередь микрозадач (Microtask Queue).
4.  **Выполнение синхронизации:** Как только стек текущих синхронных операций очищается, Angular выполняет эффект. Считывается текущее значение `this.session()`.
5.  **Запись в LocalStorage:** Выполняется инструкция `localStorage.setItem()`, сериализуя объект сессии в JSON-строку. Данные надежно сохранены на диске клиента.

---

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Бесконечный цикл эффектов (Infinite Effect Loop)**
    *   *Симптомы:* Зависание вкладки браузера, переполнение стека вызовов, ошибки производительности в консоли.
    *   *Физика процесса:* Разработчик поместил в тело эффекта чтение сигнала и одновременную запись в этот же сигнал, либо чтение другого сигнала, который косвенно влияет на первый.
        ```typescript
        // ОШИБКА: Эффект считывает и тут же пишет в один и тот же сигнал, зацикливая себя
        effect(() => {
          const user = this.session();
          this.session.set({ ...user, lastChecked: new Date() }); 
        });
        ```
    *   *Решение:* Если вам нужно прочитать сигнал внутри эффекта без создания реактивной зависимости от него (чтобы изменение этого сигнала не запускало эффект повторно), используйте функцию `untracked()`.

*   **Ошибка 2: Проблема Race Conditions при асинхронном получении профиля**
    *   *Симптомы:* После авторизации на экране кратковременно отображаются данные старого (предыдущего) пользователя, либо приложение падает с ошибками отсутствия свойств.
    *   *Физика процесса:* При смене учетной записи токен обновляется быстрее, чем сервер успевает вернуть новые данные профиля. Зависимые компоненты делают запросы к API с новым токеном, но получают данные, относящиеся к старому состоянию.
    *   *Решение:* При выходе или смене сессии всегда полностью очищайте стор, сбрасывая состояние в `null`. Зависимые вычисляемые сигналы (`isAuthenticated`, `userProfile`) должны корректно обрабатывать состояние `null` и возвращать безопасные дефолтные значения (или переключать UI в режим лоадера).

*   **Ошибка 3: Ошибка безопасности при хранении токенов доступа (XSS-уязвимости)**
    *   *Симптомы:* Утечка токенов доступа пользователя при успешной XSS-атаке злоумышленника.
    *   *Физика процесса:* Хранение чувствительных JWT-токенов в `LocalStorage` (как в Шаблоне 3) делает их легкодоступными для любого вредоносного JS-скрипта через `window.localStorage`.
    *   *Решение:* По стандарту безопасности веб-приложений (OWASP), наиболее безопасным является хранение `accessToken` в оперативной памяти (внутри сигнального `AuthStore`), а `refreshToken` — в защищенном cookie-файле с флагами `HttpOnly` и `Secure`, недоступном для чтения из JS. `LocalStorage` можно использовать только для сохранения нечувствительных метаданных профиля (имя, аватар, роль), но не самих секретных токенов доступа.