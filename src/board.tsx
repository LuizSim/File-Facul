import { createClient, type AuthSession } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface KanbanCard {
    id: string;
    content: string;
    column_id: string;
    position: number;
}

export function initializeBoard(session: AuthSession | null): void {
    if (!session?.user) {
        console.error("Usuário não está logado.");
        return;
    }
    const userId = session.user.id;

    const boardView = document.getElementById('board-view')!;
    if (!boardView) return;

    const columns = boardView.querySelectorAll<HTMLElement>(".column__cards");
    const body = document.body;
    let draggedCard: HTMLElement | null = null;
    let ghostCard: HTMLElement | null = null;
    let isDragging = false;
    let activeCard: HTMLElement | null = null;
    let startX = 0, startY = 0;

    const fetchAndRenderCards = async () => {
        const { data, error } = await supabase.from('kanban_cards').select('*').eq('owner_id', userId).order('position', { ascending: true });
        if (error) { console.error("Erro ao buscar cards:", error); return; }
        columns.forEach(col => col.innerHTML = '');
        data.forEach(cardData => {
            const targetColumn = boardView.querySelector<HTMLElement>(`#${cardData.column_id}`);
            if (targetColumn) {
                const cardEl = createCardElement(cardData);
                targetColumn.appendChild(cardEl);
            }
        });
    };

    function createCardElement(cardData: KanbanCard): HTMLElement {
        const card = document.createElement("section");
        card.className = "card";
        card.dataset.cardId = cardData.id;
        card.innerHTML = `
            <div class="card__text"></div>
            <div class="card__actions">
                <button class="edit__button" title="Editar">Editar</button>
                <button class="delete__button" title="Deletar">Deletar</button>
            </div>
        `;
        const cardText = card.querySelector('.card__text') as HTMLElement;

        cardText.innerHTML = cardData.content.replace(/\n/g, '<br>');

        addEventListenersToCard(card);
        return card;
    }

    const addCard = (targetColumn: HTMLElement) => {
        const card = document.createElement("section");
        card.className = "card creating";
        card.dataset.cardId = 'new';
        card.innerHTML = `
            <div class="card__text"></div>
            <div class="card__actions">
                <button class="edit__button" title="Editar">Editar</button>
                <button class="delete__button" title="Deletar">Deletar</button>
            </div>
        `;
        addEventListenersToCard(card);
        targetColumn.append(card);
        enableEdit(card);
        card.addEventListener('animationend', () => card.classList.remove('creating'));
    };

    const toggleCardActions = (card: HTMLElement, show: boolean) => {
        if (show) {
            if (activeCard && activeCard !== card) activeCard.classList.remove('actions-active');
            card.classList.add('actions-active');
            activeCard = card;
        } else {
            card.classList.remove('actions-active');
            if (activeCard === card) activeCard = null;
        }
    };

    const enableEdit = (card: HTMLElement) => {
        toggleCardActions(card, false);
        const cardText = card.querySelector('.card__text') as HTMLElement;
        cardText.contentEditable = 'true';
        cardText.focus();
    };

    const deleteCard = async (card: HTMLElement) => {
        const cardId = card.dataset.cardId;
        if (!cardId || cardId === 'new') {
            card.remove();
            return;
        }
        const { error } = await supabase.from('kanban_cards').delete().eq('id', cardId);
        if (error) {
            console.error("Erro ao deletar card:", error);
            alert("Não foi possível deletar o card.");
        } else {
            card.remove();
        }
    };

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('.card__actions') || target.isContentEditable) return;
        draggedCard = target.closest('.card');
        if (!draggedCard) return;

        toggleCardActions(draggedCard, false);
        const rect = draggedCard.getBoundingClientRect();
        if (e instanceof TouchEvent) {
            startX = e.touches[0].clientX - rect.left;
            startY = e.touches[0].clientY - rect.top;
        } else {
            startX = e.clientX - rect.left;
            startY = e.clientY - rect.top;
        }
        document.addEventListener('mousemove', onPointerMove);
        document.addEventListener('touchmove', onPointerMove, { passive: false });
        document.addEventListener('mouseup', onPointerUp);
        document.addEventListener('touchend', onPointerUp);
    };

    const onPointerMove = (e: MouseEvent | TouchEvent) => {
        if (!draggedCard) return;
        e.preventDefault();

        if (!isDragging) {
            isDragging = true;
            body.classList.add('dragging-active');
            ghostCard = draggedCard.cloneNode(true) as HTMLElement;
            ghostCard.classList.add('ghost');
            (ghostCard.querySelector('.card__actions') as HTMLElement)?.remove();
            document.body.appendChild(ghostCard);
            draggedCard.style.opacity = '0';
        }

        const currentX = e instanceof TouchEvent ? e.touches[0].clientX : e.clientX;
        const currentY = e instanceof TouchEvent ? e.touches[0].clientY : e.clientY;

        ghostCard!.style.left = `${currentX - startX}px`;
        ghostCard!.style.top = `${currentY - startY}px`;
        ghostCard!.style.display = 'none';
        const elementBelow = document.elementFromPoint(currentX, currentY);
        ghostCard!.style.display = '';

        columns.forEach(c => c.classList.remove('column--highlight'));
        if (elementBelow) {
            const dropColumn = elementBelow.closest('.column__cards');
            if (dropColumn) dropColumn.classList.add('column--highlight');
        }
    };

    const onPointerUp = async (e: MouseEvent | TouchEvent) => {
        document.removeEventListener('mousemove', onPointerMove);
        document.removeEventListener('touchmove', onPointerMove);
        document.removeEventListener('mouseup', onPointerUp);
        document.removeEventListener('touchend', onPointerUp);

        if (isDragging && draggedCard) {
            body.classList.remove('dragging-active');
            const currentX = e instanceof TouchEvent ? e.changedTouches[0].clientX : e.clientX;
            const currentY = e instanceof TouchEvent ? e.changedTouches[0].clientY : e.clientY;

            ghostCard!.style.display = 'none';
            const elementBelow = document.elementFromPoint(currentX, currentY);
            ghostCard!.remove();

            const dropColumn = elementBelow ? elementBelow.closest('.column__cards') : null;
            if (dropColumn) {
                dropColumn.appendChild(draggedCard);
                await supabase.from('kanban_cards').update({ column_id: dropColumn.id }).eq('id', draggedCard.dataset.cardId!);
            }
            draggedCard!.style.opacity = '1';
            columns.forEach(c => c.classList.remove('column--highlight'));
        }
        draggedCard = null;
        ghostCard = null;
        isDragging = false;
    };

    const addEventListenersToCard = (card: HTMLElement) => {
        const cardText = card.querySelector('.card__text') as HTMLElement;
        const deleteButton = card.querySelector('.delete__button') as HTMLButtonElement;
        const editButton = card.querySelector('.edit__button') as HTMLButtonElement;

        cardText.addEventListener("focusout", async () => {
            cardText.contentEditable = 'false';


            let contentToSave = cardText.innerHTML;
            const newContent = contentToSave.trim();

            const cardId = card.dataset.cardId;
            const columnId = card.parentElement!.id;

            if (!newContent) {
                if (cardId !== 'new') await supabase.from('kanban_cards').delete().eq('id', cardId!);
                card.remove();
                return;
            }

            if (cardId === 'new') {
                const { data, error } = await supabase.from('kanban_cards').insert({ content: newContent, column_id: columnId, owner_id: userId }).select().single();
                if (error) console.error("Erro ao inserir card:", error);
                else if (data) card.dataset.cardId = data.id;
            } else {
                await supabase.from('kanban_cards').update({ content: newContent }).eq('id', cardId!);
            }
        });

        deleteButton.addEventListener('click', () => deleteCard(card));
        editButton.addEventListener('click', () => enableEdit(card));
        card.addEventListener('click', (e) => {
            if (isDragging || (e.target as HTMLElement).closest('.card__actions')) return;
            toggleCardActions(card, !card.classList.contains('actions-active'));
        });
        card.addEventListener('mousedown', onPointerDown);
        card.addEventListener('touchstart', onPointerDown, { passive: true });
    };

    const addCardBtns = boardView.querySelectorAll<HTMLButtonElement>(".add-card__btn");
    addCardBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const columnCards = btn.closest('.column')!.querySelector('.column__cards') as HTMLElement;
            addCard(columnCards);
        });
    });

    boardView.addEventListener('click', (e) => {
        if (!(e.target as HTMLElement).closest('.card') && !(e.target as HTMLElement).closest('.popup') && activeCard) {
            toggleCardActions(activeCard, false);
        }
    });

    fetchAndRenderCards();
}