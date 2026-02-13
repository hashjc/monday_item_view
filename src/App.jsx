import React from "react";
import { useState, useEffect } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
//Explore more Monday React Components here: https://vibe.monday.com/
import { AttentionBox } from "@vibe/core";

// Usage of mondaySDK example, for more information visit here: https://developer.monday.com/apps/docs/introduction-to-the-sdk/
const monday = mondaySdk();

const App = () => {
  console.log('App start 324324');
  const [context, setContext] = useState();

  useEffect(() => {
    // Notice this method notifies the monday platform that user gains a first value in an app.
    // Read more about it here: https://developer.monday.com/apps/docs/mondayexecute#value-created-for-user/
    monday.execute("valueCreatedForUser");

    // Fetch initial context when the app loads and log user + board context to console.
    // `monday.get("context")` returns a promise with context data (user, board, etc.).
    monday
      .get("context")
      .then((res) => {
        // res.data contains the context object
        console.log("monday initial context:", res.data);
        if (res && res.data) {
          // Log current user context (available as `user` or `currentUser` depending on SDK version)
          console.log(
            "Current user context:",
            res.data.user || res.data.currentUser || null
          );

          // Log current board context (may be undefined in some embed contexts)
          console.log(
            "Current board context:",
            res.data.board || res.data.selectedBoard || null
          );

          // Update local state for any UI usage (keeps original behavior)
          setContext(res.data);
        }
      })
      .catch((err) => {
        console.error("Failed to get monday context:", err);
      });

    // Also listen for context updates and log them whenever they change.
    // This ensures we log fresh context if the user switches boards or users change.
    monday.listen("context", (res) => {
      setContext(res.data);
      console.log("monday context updated:", res.data);
      if (res && res.data) {
        console.log(
          "Updated user context:",
          res.data.user || res.data.currentUser || null
        );
        console.log(
          "Updated board context:",
          res.data.board || res.data.selectedBoard || null
        );
      }
    });
  }, []);

  //Some example what you can do with context, read more here: https://developer.monday.com/apps/docs/mondayget#requesting-context-and-settings-data
  const attentionBoxText = `Hello, your user_id is: ${
    context ? context.user.id : "still loading"
  }.
  Let's start building your amazing app, which will change the world!`;

  return (
    <div className="App">
      <AttentionBox
        title="Hello Monday Apps!"
        text={attentionBoxText}
        type="success"
      />
    </div>
  );
};

export default App;
