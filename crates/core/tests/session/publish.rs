use std::sync::{Arc, Mutex};

use crate::support::Harness;

#[test]
fn a_subscriber_is_published_the_state_of_the_open_presentation() {
    let (harness, folder) = Harness::with_fixture("hello-world");
    let mut session = harness.open(&folder);
    let published = Arc::new(Mutex::new(Vec::new()));
    let sink = published.clone();

    session.subscribe(move |state| sink.lock().unwrap().push(state.clone()));

    assert_eq!(*published.lock().unwrap(), [session.state()]);
}
