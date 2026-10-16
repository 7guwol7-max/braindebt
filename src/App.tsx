import { isDemo } from './api';
import { Card, DemoBanner, Page, ToastProvider } from './components/ui';
import { ClassPage } from './pages/ClassPage';
import { HomePage } from './pages/HomePage';
import { JoinPage } from './pages/JoinPage';
import { PresentPage } from './pages/PresentPage';
import { ReportPage } from './pages/ReportPage';
import { SoloPage } from './pages/SoloPage';
import { TeacherConsole } from './pages/TeacherConsole';
import { TeacherHome } from './pages/TeacherHome';
import { go, useRoute } from './router';

export default function App() {
  const r = useRoute();
  const [head, a, b] = r;
  let page;
  let banner = false;
  switch (head) {
    case undefined:
      page = <HomePage />;
      banner = true;
      break;
    case 'solo':
      page = <SoloPage level={a} />;
      break;
    case 'join':
      page = <JoinPage code={a} />;
      banner = true;
      break;
    case 'c':
      page = <ClassPage code={a} />;
      break;
    case 'teach':
      page = <TeacherHome />;
      banner = true;
      break;
    case 't':
      page = b === 'present' ? <PresentPage code={a} /> : <TeacherConsole code={a} />;
      banner = b !== 'present';
      break;
    case 'r':
      page = <ReportPage id={a} />;
      break;
    default:
      page = (
        <Page>
          <Card className="mt-10 text-center">
            <p>페이지를 찾을 수 없어요.</p>
            <button type="button" className="mt-3 font-semibold underline" onClick={() => go('/')}>
              처음으로
            </button>
          </Card>
        </Page>
      );
  }
  return (
    <ToastProvider>
      {isDemo && banner && <DemoBanner />}
      <div key={r.join('/')}>{page}</div>
    </ToastProvider>
  );
}
