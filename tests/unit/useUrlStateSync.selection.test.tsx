import { describe, it, expect, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";
import { useUrlStateSync } from "../../src/hooks/useUrlStateSync";

function Harness({
  path,
  props,
}: {
  path: string;
  props: Parameters<typeof useUrlStateSync>[0];
}) {
  function Inner() {
    useUrlStateSync(props);
    return <div data-testid="ok" />;
  }
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/*" element={<Inner />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("useUrlStateSync deep-link selection", () => {
  it("selects chat by shareId on /s/:shareId without changing route", async () => {
    const selectChat = vi.fn().mockResolvedValue(null);
    const localChats = [{ id: "c1", shareId: "s_abc" }, { id: "c2" }];
    render(
      <Harness
        path="/s/s_abc"
        props={{
          currentChatId: null,
          isAuthenticated: true,
          propShareId: "s_abc",
          localChats,
          selectChat: selectChat as any,
        }}
      />,
    );
    // Allow microtask queue to flush
    await Promise.resolve();
    expect(selectChat).toHaveBeenCalledWith("c1");
  });
});
