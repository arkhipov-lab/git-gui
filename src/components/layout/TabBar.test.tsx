import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabBar } from "./TabBar";

describe("tab bar", () => {
  it("switches and closes repository tabs", async () => {
    const user = userEvent.setup();
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(
      <MantineProvider>
        <TabBar
          tabs={["/repos/ETWeb", "/repos/FrontEnd"]}
          active="/repos/ETWeb"
          onActivate={onActivate}
          onClose={onClose}
          onReorder={() => undefined}
        />
      </MantineProvider>,
    );
    await user.click(screen.getByRole("tab", { name: "FrontEnd" }));
    expect(onActivate).toHaveBeenCalledWith("/repos/FrontEnd");
    await user.click(screen.getByRole("button", { name: "Close ETWeb" }));
    expect(onClose).toHaveBeenCalledWith("/repos/ETWeb");
  });
});
