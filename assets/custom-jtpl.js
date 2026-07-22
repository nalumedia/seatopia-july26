// Wrap all jQuery logic in a jQuery-safe wrapper
jQuery(function($) {
console.log("custom-jtpl.js initialized");
$(document).ready(function () {


const button = $('#purchaseTypeSubscriptionid');
function safeClick() {
  const scrollTop = $(window).scrollTop();
  button.trigger('click');
  $(window).scrollTop(scrollTop);
}
[0, 500, 600].forEach(function(delay) {
  setTimeout(safeClick, delay);
});


// function triggerPurchase(delay) {
//   setTimeout(function () {
//     setTimeout(function () {
//       $('#purchaseTypeSubscriptionid').trigger('click');
//     }, 500);
//   }, delay);
// }
// $('.quick-add, .quick-view__button').click(function () {
//   [2000, 2200].forEach(function(delay) {
//     triggerPurchase(delay);
//   });
// });


function triggerPurchase(delay) {
  setTimeout(function () {
    const $parent = $('.quick-view__content.drawer__content');
    if (
      $parent.length &&
      !$parent.hasClass('opacity-0') &&
      !$parent.hasClass('invisible')
    ) {
      setTimeout(function () {
        $parent.find('#purchaseTypeSubscriptionid').trigger('click');
      }, 500);
    }
  }, delay);
}
$('.quick-add, .quick-view__button').click(function () {
  [2000, 2200].forEach(function(delay) {
    triggerPurchase(delay);
  });
});


    if ($('.rtx-subscription-dropdown option').length === 0) {
        $('.cstm-purchaseTypeSubscription').hide();
        const button = $('#purchaseTypeOneTimeid');
        button.trigger('click');
        setTimeout(function () {
            button.trigger('click');
        }, 500);
    }
});

  $('#purchaseTypeOneTimeid').on('click', function() {
    console.log('triggered successfully -- purchaseTypeOneTimeid');
    $('.cstm-purchaseTypeOneTimeid').addClass('active');
    $('.cstm-purchaseTypeSubscription').removeClass('active is-selected');
  });

  $('#purchaseTypeSubscriptionid').on('click', function() {
    $('.cstm-purchaseTypeSubscription').addClass('active');
    $('.cstm-purchaseTypeOneTimeid').removeClass('active');
  });

  $(document).on('click', '#purchaseTypeOneTimeid', function () {
    const $clicked = $('[data-rtx-onetime-price]');
    const oneTimePrice = $clicked.text().trim();
    $('.custom-selling-plan').val('');

    const getAddToBtn = document.querySelector('product-buy-price');
    const mainPrice = document.querySelector('.product__price');
    if (mainPrice) mainPrice.textContent = oneTimePrice;
    if (getAddToBtn) getAddToBtn.textContent = oneTimePrice;
    const cardPrice_one_time = document.querySelector('.product-sticky-form .price__regular.whitespace-nowrap');
    console.log("cardPrice_one_time",oneTimePrice);
    if (cardPrice_one_time) cardPrice_one_time.textContent = oneTimePrice;
  });

  $(document).on('click', '#purchaseTypeSubscriptionid', function () {
    $('.cstm-purchaseTypeSubscription').addClass('active');
    $('.cstm-purchaseTypeOneTimeid').removeClass('active');

    const price = $('[data-rtx-subscription-price]').clone().children('del').remove().end().text().trim();
    const mainPrice = document.querySelector('.product__price');
    const getAddToBtn = document.querySelector('product-buy-price');
    const cardPrice_subscribe_type = document.querySelector('.product-sticky-form .price__regular.whitespace-nowrap');
    console.log("cardPrice",cardPrice_subscribe_type);
    

    if (mainPrice) mainPrice.textContent = price;
    if (getAddToBtn) getAddToBtn.textContent = price;
    if (cardPrice_subscribe_type) cardPrice_subscribe_type.textContent = price;

    const subscription_value = $('select.rtx-subscription-dropdown').val();
    $('.custom-selling-plan').val(subscription_value);
  });

  $('select.rtx-subscription-dropdown').on('change', function(){
    var subscription_value = $(this).val();
    $('.custom-selling-plan').val(subscription_value || '');
  });

  $('#purchaseTypeOneTime').on('click', function(){
    $('.custom-selling-plan').val('');
    $('.rtx-subscription-box').removeClass('is-visible');
  });

  $('#purchaseTypeSubscription').on('click', function(){
    $('.rtx-subscription-box').addClass('is-visible');
  });

  $(document).on('click', '[data-rtx-onetime-price]', function () {
    const $clicked = $(this);
    const oneTimePrice = $clicked.text().trim();
    const $productBlock = $clicked.closest('[data-product-bundle-variant]');
    const $priceElement = $productBlock.find('product-buy-price');
    if ($priceElement.length && oneTimePrice) {
      $priceElement.text(oneTimePrice);
      const numericValue = oneTimePrice.replace(/[^0-9.]/g, '');
      $priceElement.attr('data-price', parseFloat(numericValue) * 100);
    }
  });

  function updateSellingPlanBasedOnSelection() {
    if ($('#purchaseTypeSubscription').is(':checked')) {
      var subscription_value = $('select.rtx-subscription-dropdown:visible').val();
      $('.custom-selling-plan').val(subscription_value);
    } else {
      $('.custom-selling-plan').val('');
    }
  }

  setTimeout(updateSellingPlanBasedOnSelection, 1000);
  $('select.rtx-subscription-dropdown').on('change', updateSellingPlanBasedOnSelection);
  $('#purchaseTypeSubscription, #purchaseTypeOneTime').on('change', updateSellingPlanBasedOnSelection);

  if ($('.blog-grid .article-card:visible').length === 0) {
    $('.blog').html('<h3 class="no-data">No Blog post Found</h3>');
  }

  $('.sort-by').on('click', function(){
    $(this).attr('open', true);
  });

  $('.cstm-blog-sort').on('click', function(e){
    e.stopPropagation();
    setTimeout(function(){
      $('.sort-by').removeAttr('open');
    }, 0);
  });
});

// Native JS: DOMContentLoaded events

document.addEventListener('DOMContentLoaded', function () {
  const rtxPdpContainer = document.getElementById('rtx-bundle-pdp-container');
  const bundleWrapper = document.querySelector('product-bundle');

  if (!bundleWrapper || !rtxPdpContainer) return;

  const updateVisibility = () => {
    const selectedItems = bundleWrapper.querySelectorAll('[data-product-bundle-variant][available]');
    rtxPdpContainer.style.display = selectedItems.length > 0 ? 'none' : 'block';
  };

  updateVisibility();
  document.addEventListener('productBundleUpdated', updateVisibility);
  const observer = new MutationObserver(updateVisibility);
  observer.observe(bundleWrapper, { childList: true, subtree: true });
});

document.addEventListener('DOMContentLoaded', function () {
  if(document.querySelector('[data-role="bundle-subscription-selector"]')){
    const planSelector = document.querySelector('[data-role="bundle-subscription-selector"]');

    planSelector.addEventListener('change', function () {
      let selectedPlanId = this.value;
      let selectedText = this.options[this.selectedIndex].text.toLowerCase();
      const bundleItems = document.querySelectorAll('[data-product-bundle-variant]:not([available])');

      bundleItems.forEach(item => {
        if (selectedPlanId) {
          const url = item.getAttribute("data-product-handle");
          document.querySelectorAll(".bundle-subscription-select-jtpl[data-product-handle='" + url + "'] option").forEach(option => {
            let option_plan = option.getAttribute("data-plan")?.trim().toLowerCase();
            if (option_plan?.includes("delivered")) option_plan = option_plan.replace(/delivered/g, "delivery");
            if (option_plan?.trim() === selectedText.trim()) {
              selectedPlanId = option.value;
              return;
            }
          });

          item.setAttribute('data-selling-plan-id', selectedPlanId);
          let input = item.querySelector('input[name="selling_plan"]') || document.createElement('input');
          input.type = 'hidden';
          input.name = 'selling_plan';
          input.value = selectedPlanId;
          if (!item.contains(input)) item.appendChild(input);
        } else {
          item.removeAttribute('data-selling-plan-id');
          const input = item.querySelector('input[name="selling_plan"]');
          if (input) input.remove();
        }
      });
    });
  }
});

document.addEventListener('DOMContentLoaded', function() {
  const containers = document.getElementsByClassName('tags-container');
  Array.from(containers).forEach(container => {
    const tags = Array.from(container.children);
    for (let i = tags.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tags[i], tags[j]] = [tags[j], tags[i]];
    }
    const limitedTags = tags.slice(0, 3);
    container.innerHTML = '';
    limitedTags.forEach(tag => container.appendChild(tag));
  });
});

document.addEventListener('click', function(e) {
  if (e.target.matches('a[href^="#test-results"]')) {
    e.preventDefault();
    const target = document.getElementById('test-results');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }
});

$(document).ready(function () {
  if ($('[id^="MainCart"]')) {
    if (document.querySelector(".minimum-order-msg")) {
          console.log($("shopify-accelerated-checkout"))
            $("shopify-accelerated-checkout-cart").css({"pointer-events": "none", "cursor": "not-allowed","opacity":"0.5"});
          setTimeout(()=>{
          },1000)
        }
        else{     
          $("shopify-accelerated-checkout-cart").css({"pointer-events": "unset", "cursor": "pointer","opacity":"1"});
          setTimeout(()=>{
          },1000)
        }
  }
 
});
