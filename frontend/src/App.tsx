import React, { useState } from "react";
import { DashboardPage } from "./pages/DashboardPage";
import { EditorPage } from "./pages/EditorPage";
import { ErrorBoundary } from "./components/ErrorBoundary";

export const App: React.FC = () => {
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);

  return (
    <ErrorBoundary onResetHome={() => setActiveDocumentId(null)}>
      <div className="w-full h-full min-h-screen">
        {activeDocumentId ? (
          <EditorPage
            documentId={activeDocumentId}
            onBackToDashboard={() => setActiveDocumentId(null)}
            onOpenDocument={(id) => setActiveDocumentId(id)}
          />
        ) : (
          <DashboardPage onOpenDocument={(id) => setActiveDocumentId(id)} />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;
