import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import AppLayout from "./components/AppLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AIContent from "./pages/AIContent";
import Accounts from "./pages/Accounts";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Materials from "./pages/Materials";
import PublishTasks from "./pages/PublishTasks";
import Settings from "./pages/Settings";
import SeoTemplates from "./pages/SeoTemplates";
import GoogleSites from "./pages/GoogleSites";
import BatchGeneration from "./pages/BatchGeneration";
import PublishedPages from "./pages/PublishedPages";
import SystemLogs from "./pages/SystemLogs";

function Router() {
  return (
    <Switch>
      {/* Login page - outside AppLayout, no auth check */}
      <Route path="/login" component={Login} />

      {/* All other pages - inside AppLayout (handles auth redirect) */}
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/accounts" component={Accounts} />
            <Route path="/ai-content" component={AIContent} />
            <Route path="/materials" component={Materials} />
            <Route path="/publish-tasks" component={PublishTasks} />
            <Route path="/settings" component={Settings} />
            <Route path="/seo-templates" component={SeoTemplates} />
            <Route path="/sites" component={GoogleSites} />
            <Route path="/batch-generation" component={BatchGeneration} />
            <Route path="/published-pages" component={PublishedPages} />
            <Route path="/logs" component={SystemLogs} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <div translate="no" className="notranslate">
      <ErrorBoundary>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </div>
  );
}

export default App;
