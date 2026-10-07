# Supabase 방명록 연결과 운영

GitHub Pages에서 Supabase로 직접 읽기·쓰기를 요청하는 방명록입니다. 별도 서버나 Supabase GitHub 연동은 필요하지 않습니다. 사이트 연결값은 입력돼 있으며, 아래 SQL로 테이블을 준비하면 사용할 수 있습니다.

## 1 Supabase에서 테이블 생성

1. [현재 Supabase 프로젝트](https://supabase.com/dashboard/project/envvunfvyabiiwurfpoa)를 엽니다.
2. 왼쪽 **SQL Editor**에서 **New query** 또는 **+**를 누릅니다.
3. 이 저장소의 `supabase/migrations/202610070001_guestbook.sql` 전체를 복사해서 붙여넣습니다.
4. **Run**을 누릅니다. `Success. No rows returned`가 표시되면 정상입니다.
5. **Table Editor → guestbook_entries**에 `id`, `author`, `message`, `color`, `created_at` 열이 보이는지 확인합니다. 최초에는 비어 있습니다.

이 SQL은 방명록 테이블, 입력 길이 제한, RLS 정책, 공개 읽기·작성 권한, Realtime 등록을 함께 설정합니다. 같은 SQL을 다시 실행해도 기존 글을 지우지 않습니다. 기존에 같은 이름으로 다른 구조의 테이블을 만들었다면 먼저 구조를 확인해야 합니다.

공개용 키로는 테이블 생성 권한이 없으므로 이 단계는 프로젝트 소유자가 SQL Editor에서 실행해야 합니다.

## 2 사이트 연결값

`src/supabase-config.ts`에 전달받은 Project URL과 Publishable key를 연결해 두었습니다. 현재 프로젝트를 그대로 사용하면 추가 입력이 필요 없습니다. Publishable key는 브라우저에 공개되는 용도이고, 데이터 접근 제한은 데이터베이스의 RLS와 SQL 권한으로 처리합니다. `service_role`, `sb_secret_` 키나 DB 비밀번호는 이 파일에 넣지 마세요.

다른 프로젝트로 변경하려면 로컬에서는 `.env.example`을 `.env.local`로 복사해 두 값을 수정한 다음 개발 서버를 재시작합니다. GitHub 배포에서는 저장소 **Settings → Secrets and variables → Actions → New repository secret**에 다음 두 항목을 설정할 수 있습니다.

| 이름 | 값 |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key |

배포 빌드에서 위 설정이 코드의 기본값보다 우선합니다. `VITE_` 값은 완성된 브라우저 코드에 포함되므로 GitHub Secret에 넣어도 방문자에게는 공개됩니다. 공개용 키만 사용하세요.

## 3 GitHub Pages 배포

Pages의 Source는 기존처럼 **GitHub Actions**를 유지합니다. `main`에 변경 사항이 올라가면 자동으로 빌드·배포됩니다. 수동 실행은 저장소 **Actions → Deploy to GitHub Pages → Run workflow → main → Run workflow**입니다.

- 메인 페이지: https://minkyoungux.github.io/Interactive-web/
- 방명록: https://minkyoungux.github.io/Interactive-web/guestbook.html
- 배포 상태: https://github.com/minkyoungux/Interactive-web/actions

이미 배포된 사이트에서 SQL만 새로 실행했다면 방명록을 새로고침하면 됩니다. 사이트 재배포는 필요 없습니다. 연결값을 변경했다면 재배포해야 합니다.

## 4 동작 확인

1. 메인 페이지 우상단 **방명록**을 누릅니다.
2. 이름과 내용을 입력하고 색상을 선택한 뒤 **작성하기**를 누릅니다.
3. 저장 완료 안내와 함께 새 포스트잇이 맨 위에 붙는지 확인합니다.
4. 새로고침해도 글이 남아 있는지 확인합니다.
5. 다른 창에서도 방명록을 열고 새 글을 작성합니다. 두 창에 같은 포스트잇이 추가되면 Realtime 연결도 정상입니다.

이름은 최대 30자, 내용은 최대 500자입니다. 최근 글부터 30개씩 불러오고 **이전 방명록 더 보기**로 이어서 봅니다. 저장 실패 시 입력 내용은 유지됩니다. 실시간 연결이 끊겨도 화면을 다시 열거나 온라인으로 돌아오면 글을 갱신하고, 활성 화면에서는 30초마다 최신 글을 추가 확인합니다.

## 5 문제 해결과 관리

### 답글과 대댓글 활성화

SQL Editor의 새 쿼리에서 `supabase/migrations/202610070002_guestbook_replies.sql` 전체를 실행하세요. 기존 방명록 테이블을 만든 뒤 실행해야 합니다. 기존 글을 삭제하지 않고 `guestbook_replies` 테이블, 읽기·작성 권한, 실시간 구독 설정을 추가합니다. 테이블이 준비되기 전에도 기존 방명록 기능은 동작합니다.

방명록의 **답글 보기 / 쓰기**를 열어 이름과 답글을 입력합니다. 답글 아래 **답글 달기**를 누르면 그 답글에 대댓글을 남길 수 있습니다. 대댓글은 한 단계 들여쓰기와 받는 사람 이름으로 표시하고, 전체 대화는 작성 시간순으로 보여줍니다. 30개씩 불러오며 더 보기로 이어서 읽습니다. 새 답글은 실시간으로 추가됩니다. 익명 이름이므로 본인 인증된 이름은 아닙니다.

방문자에게 답글 수정·삭제 권한은 없습니다. 관리자가 방명록을 삭제하면 해당 글의 답글도 삭제되며, 부모 답글을 삭제하면 그 아래 대댓글도 함께 삭제됩니다. 삭제 작업은 Supabase Table Editor에서 대상 내용을 확인한 뒤 진행하세요.

| 증상 | 확인할 내용 |
| --- | --- |
| 준비 중으로 표시됨 | SQL을 현재 프로젝트에서 실행했는지, 테이블·권한이 생성됐는지 확인 |
| 불러오기나 저장 실패 | 프로젝트 일시 중지 여부, 인터넷 연결, 공개용 키, RLS 정책 확인 |
| 새로고침해야 다른 사람 글이 보임 | `supabase_realtime` publication에 `guestbook_entries`가 포함됐는지 확인. 제공 SQL이 자동 등록함 |
| API에서 테이블을 못 찾음 | Data API가 활성화돼 있고 `public` 스키마/방명록 테이블이 노출돼 있는지 확인 |
| 환경변수 변경이 반영 안 됨 | 개발 서버 재시작 또는 GitHub Actions 재배포 |

방문자는 로그인 없이 작성하며 이름은 본인 인증된 이름이 아닙니다. 누구나 방명록 내용을 읽을 수 있고 수정·삭제는 방문자에게 허용하지 않습니다. 부적절한 글은 소유자가 Supabase Table Editor에서 삭제할 수 있습니다. 삭제한 글은 이미 열린 화면에서는 새로고침 후 사라집니다.

이 구성은 공개 익명 방명록이며 서버 측 스팸 차단이나 요청 횟수 제한은 포함하지 않습니다. 공개 범위와 사용량을 확인하고, 방문자가 많아지면 CAPTCHA·인증·쓰기 제한을 추가하는 것이 좋습니다.

공식 참고: [행 수준 보안](https://supabase.com/docs/guides/database/postgres/row-level-security), [실시간 변경 구독](https://supabase.com/docs/guides/realtime/postgres-changes).
