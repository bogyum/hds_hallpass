# Firebase 초기 설정 가이드

## 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com)에서 새 프로젝트 생성
2. **Firestore Database** 활성화 (프로덕션 모드)
3. **Storage** 활성화 (선택사항, 음원 교체 시 필요)

## 2. .env.local 설정

`.env.local.example`을 복사하여 `.env.local`을 생성하고 Firebase 콘솔에서 값 복사:

```bash
cp .env.local.example .env.local
```

Firebase 콘솔 → 프로젝트 설정 → 앱 → SDK 설정에서 값 확인.

## 3. Firestore Security Rules 적용

Firebase 콘솔 → Firestore → 규칙 탭에서 `firestore.rules` 내용 붙여넣기 후 게시.

## 4. 초기 데이터 삽입 (Firebase 콘솔)

### 관리자 계정 추가

Firestore → `admins` 컬렉션 → 문서 추가:

| 필드 | 값 | 타입 |
|------|-----|------|
| adminId | `admin` | string |
| passwordHash | (아래 SHA-256 해시 값) | string |
| schoolCodes | `[]` (빈 배열 = 전체 접근) | array |

**비밀번호 "admin1234"의 SHA-256 해시 계산하기:**

브라우저 콘솔(F12)에서 실행:
```javascript
const text = "admin1234";
const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
const hash = Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2,"0")).join("");
console.log(hash);
```

### 학교 등록 (관리자 앱에서 직접 등록 가능)

앱 실행 후 `/admin` 로그인 → "학교코드 관리" 탭에서 등록.

> ⚠️ **주의:** 현재 Firestore Rules에서 클라이언트 쓰기를 일부 제한합니다.  
> 개발 단계에서는 Rules를 아래와 같이 임시로 완화하세요:
> ```
> match /{document=**} {
>   allow read, write: if true;
> }
> ```
> 운영 전에 반드시 `firestore.rules`로 교체하세요.

## 5. 개발 서버 실행

```bash
npm run dev
# → http://localhost:3000
```

## 6. 교무실 구성 (흥덕고 기준)

| 코드 | 이름 |
|------|------|
| office_1 | 1학년 교무실 |
| office_2 | 2학년 교무실 |
| office_3 | 3학년 교무실 |
| office_main | 본 교무실 |
| office_special | 특별실 |
