class TagFilter extends HTMLSelectElement {
  constructor() {
    super();

    this.beforeInit();
    this.addEventListener('change', this.onChange);
  }

  beforeInit() {
    const value = this.options[this.selectedIndex].text;
    const width = theme.getElementWidth(this, value);
    this.style.setProperty('--width', `${width}px`);
  }

  onChange() {
    window.location.href = this.value;
  }
}

customElements.define('tag-filter', TagFilter, { extends: 'select' });

$('.sort-by').click(function(){
    $(this).attr('open', true);
});
$('.cstm-blog-sort').click(function(e){
    e.stopPropagation();
    setTimeout(function(){
         $('.sort-by').removeAttr('open');
    },0)
});



