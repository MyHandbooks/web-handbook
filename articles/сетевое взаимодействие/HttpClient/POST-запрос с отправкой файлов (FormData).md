---
tags: [angular, сетевое-взаимодействие, HttpClient]
related: ["[[Безопасный GET-запрос со сложными параметрами.md]]", "[[Обработка сетевых ошибок и авто-повтор (Retry).md]]"]
status: "completed"
---

# POST-запрос с отправкой файлов через FormData

## БЫСТРЫЙ СТАРТ

*   **Класс `FormData`** — встроенный браузерный API для создания структуры данных в формате «ключ-значение», которая имитирует отправку HTML-формы с кодировкой `multipart/form-data`. Это единственный стандартный способ передачи бинарных данных (файлов, блобов) совместно с текстовыми полями в рамках одного HTTP-запроса.
*   **Правила использования:**
    *   **Используйте:** Для загрузки картинок, PDF-документов, аудио/видео файлов, архивов на сервер вместе со связанными метаданными (описанием, идентификатором родительской сущности, тегами).
    *   **Не используйте:** Для стандартных операций создания или изменения чисто текстовых сущностей. Если в запросе нет бинарных данных, всегда отправляйте сырой JSON-объект — это снижает нагрузку на парсер бэкенда и сохраняет строгую типизацию сетевого интерфейса.
*   **Главное правило безопасности:** Никогда не устанавливайте заголовок `Content-Type: multipart/form-data` вручную в настройках `HttpClient`. Браузер должен сформировать этот заголовок самостоятельно, чтобы автоматически добавить уникальный строковый разделитель (boundary).

---

## ПРАКТИЧЕСКИЕ ШАБЛОНЫ ДЛЯ КОПИРОВАНИЯ

### Шаблон 1: Корпоративная служба загрузки файлов с отслеживанием прогресса
*   **Назначение:** Надежная служба на базе `HttpClient`, отправляющая файл с метаданными и возвращающая реактивный поток событий для отображения точного процента загрузки на UI.

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpEvent, HttpEventType, HttpRequest } from '@angular/common/http';
import { Observable, map, filter } from 'rxjs';

// Описываем типизированную структуру текстовых метаданных
export interface FileUploadMetadata {
  ownerId: string;         // Уникальный идентификатор владельца файла
  documentCategory: string; // Категория документа (например, 'invoice', 'passport')
  isTemporary: boolean;    // Флаг временного хранения файла
}

// Интерфейс для реактивного отслеживания состояния процесса в UI
export interface UploadProgressState {
  progressPercentage: number; // Процент выполнения от 0 до 100
  isCompleted: boolean;       // Флаг успешного завершения загрузки
  responseBody: unknown | null; // Тело ответа сервера (после завершения)
}

@Injectable({
  providedIn: 'root'
})
export class FileUploadService {
  // Внедряем HttpClient через функциональный inject()
  private readonly http = inject(HttpClient);
  
  // URL-адрес эндпоинта для загрузки медиаданных
  private readonly uploadEndpoint = 'https://api.enterprise-service.com/v1/documents';

  /**
   * Инициирует загрузку файла на сервер с отслеживанием прогресса
   * @param file Объект бинарного файла из формы выбора
   * @param metadata Сопутствующие текстовые параметры
   */
  public uploadDocument(file: File, metadata: FileUploadMetadata): Observable<UploadProgressState> {
    // Конструируем экземпляр FormData для упаковки разнородных данных
    const formData = new FormData();

    // Добавляем бинарный файл. Третий параметр явно задает оригинальное имя файла для сервера
    formData.append('documentFile', file, file.name);

    // Добавляем сопутствующие текстовые поля. Примитивы приводим к строковому типу
    formData.append('ownerId', metadata.ownerId);
    formData.append('category', metadata.documentCategory);
    formData.append('isTemporary', String(metadata.isTemporary));

    // Создаем кастомный конфигурационный объект запроса
    const uploadRequest = new HttpRequest('POST', this.uploadEndpoint, formData, {
      // Инструктируем браузер отслеживать промежуточные события отправки данных
      reportProgress: true,
      // Указываем Angular возвращать сырой поток событий HttpEvent вместо финального JSON
      responseType: 'json'
    });

    // Отправляем сформированный запрос и трансформируем поток событий
    return this.http.request<unknown>(uploadRequest).pipe(
      map((event: HttpEvent<unknown>): UploadProgressState => {
        switch (event.type) {
          // Событие отправки очередного чанка данных на сервер
          case HttpEventType.UploadProgress: {
            const totalBytes = event.total ?? 1; // Защита от деления на undefined/0
            const currentProgress = Math.round((100 * event.loaded) / totalBytes);
            return {
              progressPercentage: currentProgress,
              isCompleted: false,
              responseBody: null
            };
          }

          // Событие финального успешного получения ответа от сервера
          case HttpEventType.Response: {
            return {
              progressPercentage: 100,
              isCompleted: true,
              responseBody: event.body
            };
          }

          // Игнорируем промежуточные системные события (Sent, ResponseHeader и т.д.)
          default: {
            return {
              progressPercentage: 0,
              isCompleted: false,
              responseBody: null
            };
          }
        }
      }),
      // Пропускаем дальше только те состояния, которые несут полезную информацию для UI
      filter((state) => state.progressPercentage > 0 || state.isCompleted)
    );
  }
}
```

---

### Шаблон 2: Интерактивный компонент выбора и загрузки файлов на Сигналах
*   **Назначение:** UI-компонент, обрабатывающий системный выбор файлов, хранящий локальное состояние через сигналы и визуализирующий шкалу загрузки.

#### 1. Файл логики: `file-uploader.ts`
```typescript
import { Component, ElementRef, viewChild, signal, inject, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FileUploadService, UploadProgressState } from './file-upload.service';

@Component({
  selector: 'app-file-uploader',
  // standalone: true опускается по умолчанию в Angular 19+
  imports: [], // Массив импортов пуст, так как используются только нативные элементы и встроенный Control Flow
  templateUrl: './file-uploader.html',
  styleUrl: './file-uploader.css',
  changeDetection: ChangeDetectionStrategy.OnPush // OnPush гарантирует перерисовку только при изменении сигналов
})
export class FileUploader { // Имя класса очищено от устаревшего суффикса Component
  private readonly uploadService = inject(FileUploadService);
  private readonly destroyRef = inject(DestroyRef);

  // Получаем доступ к скрытому нативному инпуту через сигнальный запрос viewChild()
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInputRef');

  // Объединяем локальное состояние загрузки в единый реактивный сигнал
  public readonly currentUploadState = signal({
    fileName: '',
    isUploading: false,
    percentage: 0,
    isSuccess: false
  });

  /**
   * Эмулирует клик по скрытому системному input-элементу
   */
  public triggerFileSelection(): void {
    const inputNativeElement = this.fileInput()?.nativeElement;
    if (inputNativeElement) {
      inputNativeElement.click();
    }
  }

  /**
   * Обрабатывает выбор файла пользователем в системном диалоге
   */
  public onFileSelected(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const fileList = inputElement.files;

    if (!fileList || fileList.length === 0) {
      return; // Пользователь закрыл диалог без выбора файла
    }

    const selectedFile = fileList[0];

    // Сбрасываем состояние под новый файл
    this.currentUploadState.set({
      fileName: selectedFile.name,
      isUploading: true,
      percentage: 0,
      isSuccess: false
    });

    // Инициализируем сопутствующие метаданные
    const demoMetadata = {
      ownerId: 'usr-9281-arch',
      documentCategory: 'passport',
      isTemporary: false
    };

    // Запускаем асинхронную загрузку
    this.uploadService.uploadDocument(selectedFile, demoMetadata)
      .pipe(
        // Автоматически отписываемся от потока при уничтожении компонента для предотвращения утечек памяти
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (state: UploadProgressState) => {
          // Синхронно обновляем реактивный сигнал при получении событий прогресса
          this.currentUploadState.update((prev) => ({
            ...prev,
            percentage: state.progressPercentage,
            isSuccess: state.isCompleted,
            isUploading: !state.isCompleted
          }));
        },
        error: (err: Error) => {
          console.error('Ошибка при передаче данных на сервер:', err);
          this.currentUploadState.update((prev) => ({
            ...prev,
            isUploading: false,
            percentage: 0
          }));
        }
      });
  }
}
```

#### 2. Файл разметки: `file-uploader.html`
```html
<div class="upload-container">
  <!-- Скрытый нативный input для вызова системного проводника -->
  <input 
    type="file" 
    #fileInputRef
    style="display: none" 
    (change)="onFileSelected($event)"
    accept="image/*,application/pdf"
  />

  <!-- Кастомная кнопка запуска выбора файлов -->
  <button 
    class="action-btn" 
    [disabled]="currentUploadState().isUploading"
    (click)="triggerFileSelection()"
  >
    Выбрать документ
  </button>

  <!-- Отображение текущего имени файла и прогресс-бара -->
  @if (currentUploadState().fileName; as name) {
    <div class="file-info-card">
      <p class="file-name">Файл: {{ name }}</p>
      
      @if (currentUploadState().isUploading) {
        <div class="progress-bar-track">
          <div 
            class="progress-bar-fill" 
            [style.width.%]="currentUploadState().percentage"
          ></div>
        </div>
        <span class="progress-text">Загружено: {{ currentUploadState().percentage }}%</span>
      }

      @if (currentUploadState().isSuccess) {
        <p class="success-message">Документ успешно сохранен в облаке!</p>
      }
    </div>
  }
</div>
```

#### 3. Файл стилей: `file-uploader.css`
```css
.upload-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
}

.progress-bar-track {
  width: 100%;
  height: 8px;
  background-color: var(--border);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 8px;
}

.progress-bar-fill {
  height: 100%;
  background-color: var(--accent);
  transition: width 0.1s linear;
}

.success-message {
  color: var(--success-text);
  font-weight: 600;
  font-size: 0.9rem;
  margin-top: 8px;
}

.file-info-card {
  padding: 12px;
  background-color: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-top: 8px;
}

.file-name {
  font-size: 0.9rem;
  font-weight: 500;
  word-break: break-all;
}

.progress-text {
  font-size: 0.8rem;
  color: var(--text-muted);
  display: inline-block;
  margin-top: 4px;
}

.action-btn {
  padding: 10px 16px;
  background-color: var(--accent);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color var(--transition-speed);
}

.action-btn:hover {
  background-color: var(--accent-hover);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

---

## ГЛУБОКОЕ ПОГРУЖЕНИЕ

### 1. Физика multipart/form-data и механизм генерации Boundary
Когда вы отправляете обычный JSON-запрос (`application/json`), тело запроса представляет собой одну сплошную строку сериализованного текста. При работе с медиа-файлами такой подход неэффективен и небезопасен: кодирование бинарного файла в Base64-строку увеличивает его размер примерно на 33% и создает колоссальную нагрузку на оперативную память устройства в момент сборки строки.

Для решения этой проблемы стандарт `multipart/form-data` разделяет тело одного HTTP-запроса на независимые изолированные секции (части). Каждая часть содержит собственные локальные заголовки и сырое бинарное или текстовое содержимое:

```http
POST /v1/documents HTTP/1.1
Host: api.enterprise-service.com
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxkTrZu0gW

------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="documentFile"; filename="avatar.png"
Content-Type: image/png

[Сырые бинарные данные картинки]
------WebKitFormBoundary7MA4YWxkTrZu0gW
Content-Disposition: form-data; name="ownerId"

usr-9281-arch
------WebKitFormBoundary7MA4YWxkTrZu0gW--
```

Заголовок `boundary` указывает серверному парсеру (например, библиотеке `multer` в Node.js), по какому именно маркеру нужно разрезать приходящий бинарный поток данных в оперативной памяти. Этот маркер генерируется движком браузера динамически перед отправкой сетевого пакета и гарантированно не пересекается по сигнатуре с содержимым отправляемых файлов.

### 2. Принцип работы reportProgress в Angular HttpClient
В обычной конфигурации HTTP-клиент Angular использует стандартный браузерный интерфейс `XMLHttpRequest` (XHR) под капотом. Когда вы передаете опцию `reportProgress: true` в настройках запроса, Angular подписывается на низкоуровневые события `progress` нативного объекта `xhr.upload`.

Каждый раз, когда сетевая карта операционной системы завершает отправку очередного физического кадра (сетевого пакета) данных в веб-сокет, браузер генерирует аппаратное прерывание. XHR-клиент считывает количество успешно переданных байт на данный момент и генерирует событие, которое Angular оборачивает в реактивное перечисление `HttpEventType.UploadProgress`. Если вы не укажете `reportProgress: true`, Angular проигнорирует промежуточные системные прерывания и вернет только одно финальное событие `Response`.

### 3. Пошаговый разбор сериализации объектов внутри FormData
Распространенное заблуждение — попытка передать глубоко вложенные JSON-объекты напрямую в `FormData`:
```typescript
const metadata = { details: { code: 123 } };
formData.append('meta', metadata); // Ошибка сериализации!
```
Нативный метод `FormData.append(key, value)` принимает в качестве значения только объекты типов `Blob`, `File` или простые строки. Если вы попытаетесь передать туда JavaScript-объект, браузер неявно вызовет метод `.toString()`, превратив ваши данные на сервере в бесполезную текстовую строку `"[object Object]"`.

Для корректной передачи связанных структурированных данных внутри `multipart/form-data` необходимо использовать один из двух подходов:
1.  **Поклеточный разбор:** Плоские свойства объекта раскладываются по отдельным текстовым ключам `FormData` (как показано в Шаблоне 1).
2.  **JSON-Blob подход:** Сложный объект сериализуется в JSON-строку и упаковывается в мини-блоб с явным указанием его типа контента:
    ```typescript
    const metaBlob = new Blob([JSON.stringify(complexObject)], { 
      type: 'application/json' 
    });
    formData.append('metadata', metaBlob);
    ```
    Серверный парсер на бэкенде прочитает эту часть запроса как полноценный JSON-файл и сможет автоматически десериализовать его в объект.

### 4. Типичные ошибки и их решение

*   **Ошибка 1: Ошибка ручного указания Content-Type (The Manual Boundary Stripping Bug)**
    *   *Симптомы:* Сервер возвращает ошибку `500 Internal Server Error` с детальным описанием вида: *"No multipart boundary was found"* или *"Multipart parser: boundary not found"*.
    *   *Физика процесса:* Разработчик пытается быть аккуратным и принудительно задает заголовок: `headers.set('Content-Type', 'multipart/form-data')`. В этот момент затирается автоматический браузерный разделитель `boundary`. Бэкенд получает запрос с заголовком `'Content-Type: multipart/form-data'`, но не знает, по какому маркеру разделять тело запроса, и аварийно завершает обработку.
    *   *Решение:* Никогда не указывайте `multipart/form-data` в заголовках. Передавайте объект `FormData` в метод `http.post()` в чистом виде — браузер сделает всю работу за вас.

```typescript
// ОШИБКА: Затирание boundary
// const headers = new HttpHeaders({ 'Content-Type': 'multipart/form-data' });
// return this.http.post(url, formData, { headers });

// ХОРОШО: Браузер сам выставит Content-Type со всеми необходимыми boundaries
return this.http.post(url, formData);
```

*   **Ошибка 2: Падение приложения при отправке больших файлов (Out of Memory в браузере)**
    *   *Симптомы:* При попытке загрузить файл размером более 500 МБ страница браузера аварийно закрывается или генерирует ошибку нехватки памяти.
    *   *Физика процесса:* Чтение файла в оперативную память для обработки через JavaScript-слой (например, генерация хэшей или чтение через `FileReader` в массив байт перед отправкой) забивает Heap-память браузера.
    *   *Решение:* Передавайте нативный объект `File`, полученный напрямую из события `change` инпута, прямо в `FormData.append()`. Нативные объекты `File` являются ссылками на дескрипторы файлов в ОС (Pointer) и не считываются браузером в оперативную память целиком до момента физической отправки пакетов по сети сетевой картой.

*   **Ошибка 3: Утечки памяти при отсутствии явной отписки от прогресс-бара**
    *   *Симптомы:* Медленный рост потребления памяти приложением (Memory Leak), дублирование логов в консоли после многократных повторных загрузок файлов.
    *   *Физика процесса:* Поток событий `HttpClient.request()` при включенном `reportProgress: true` испускает огромное количество промежуточных событий. Если компонент уничтожается пользователем до того, как тяжелый файл успел полностью догрузиться на сервер, подписка `.subscribe()` остается активной в фоновом режиме, удерживая ссылку на уничтоженный компонент и блокируя работу сборщика мусора.
    *   *Решение:* Используйте оператор `takeUntilDestroyed` из библиотеки `@angular/core/rxjs-interop` (как показано в Шаблоне 2) для гарантированной мгновенной отписки от потока событий и отмены сетевого соединения при уходе пользователя со страницы.