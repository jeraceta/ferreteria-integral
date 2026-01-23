document.addEventListener("DOMContentLoaded", function() {
    const activeSubItem = document.querySelector('.sub-item.active');

    if (activeSubItem) {
        const submenu = activeSubItem.closest('.collapse');
        if (submenu) {
            // Ensure the submenu is shown
            submenu.classList.add('show');
            
            // Find the trigger and add the active-parent class
            const trigger = document.querySelector(`[data-bs-target="#${submenu.id}"]`);
            if (trigger) {
                trigger.classList.add('active-parent');
                trigger.setAttribute('aria-expanded', 'true');
            }
        }
    }
});
