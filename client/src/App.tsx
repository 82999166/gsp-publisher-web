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
import Hyperlinks from "./pages/Hyperlinks";
import Indexing from "./pages/Indexing";
import Materials from "./pages/Materials";
import PublishTasks from "./pages/PublishTasks";
import Settings from "./pages/Settings";

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/ai-content" component={AIContent} />
        <Route path="/materials" component={Materials} />
        <Route path="/publish-tasks" component={PublishTasks} />
        <Route path="/hyperlinks" component={Hyperlinks} />
        <Route path="/indexing" component={Indexing} />
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
