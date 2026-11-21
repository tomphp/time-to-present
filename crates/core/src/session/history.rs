use crate::script::Script;

/// The linear undo/redo stack: a snapshot of the Script before each step, without limit,
/// with the Named Events the step newly gave a Moved badge.
/// The latest step may be a drag still going on, which later steps of the same drag replace.
#[derive(Debug, Default)]
pub struct History {
    undo: Vec<Step>,
    redo: Vec<Step>,
    drag: Option<Drag>,
}

#[derive(Debug)]
struct Step {
    script: Script,
    moved: Vec<String>,
}

#[derive(Debug)]
struct Drag {
    id: String,
    state: DragState,
}

#[derive(Debug, PartialEq)]
enum DragState {
    Stepped,
    BackAtStart,
    Ended,
}

impl History {
    pub fn record(&mut self, before: Script, moved: Vec<String>) {
        self.undo.push(Step {
            script: before,
            moved,
        });
        self.redo.clear();
        self.end_drag();
    }

    pub fn record_drag(&mut self, before: Script, drag: &str) {
        self.record(before, Vec::new());
        self.drag = Some(Drag {
            id: drag.to_string(),
            state: DragState::Stepped,
        });
    }

    pub fn drag_ended(&self, drag: &str) -> bool {
        self.drag_state(drag) == Some(&DragState::Ended)
    }

    pub fn drag_start(&self, drag: &str) -> Option<&Script> {
        let stepped = self.drag_state(drag) == Some(&DragState::Stepped);
        self.undo
            .last()
            .filter(|_| stepped)
            .map(|step| &step.script)
    }

    pub fn drop_drag_step(&mut self) {
        if let Some(drag) = &mut self.drag {
            self.undo.pop();
            drag.state = DragState::BackAtStart;
        }
    }

    /// Steps back, returning the events the undone step gave a Moved badge.
    pub fn undo(&mut self, current: &mut Script) -> Option<&[String]> {
        self.end_drag();
        Self::step(&mut self.undo, &mut self.redo, current)
    }

    /// Steps forward, returning the events the redone step gave a Moved badge.
    pub fn redo(&mut self, current: &mut Script) -> Option<&[String]> {
        self.end_drag();
        Self::step(&mut self.redo, &mut self.undo, current)
    }

    fn drag_state(&self, drag: &str) -> Option<&DragState> {
        self.drag
            .as_ref()
            .filter(|open| open.id == drag)
            .map(|open| &open.state)
    }

    fn end_drag(&mut self) {
        if let Some(drag) = &mut self.drag {
            drag.state = DragState::Ended;
        }
    }

    fn step<'a>(
        from: &mut Vec<Step>,
        to: &'a mut Vec<Step>,
        current: &mut Script,
    ) -> Option<&'a [String]> {
        let Step { script, moved } = from.pop()?;
        to.push(Step {
            script: std::mem::replace(current, script),
            moved,
        });
        to.last().map(|step| step.moved.as_slice())
    }
}
